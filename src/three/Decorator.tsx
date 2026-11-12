import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildDisplayObject } from '../catalog/build';
import { catalogItem, type CatalogItem } from '../catalog/catalog';
import { pointInPolygon } from '../model/geometry';
import { insideRect, type Rect } from '../model/lot';
import { isBlocked, pickWallFace, rectCorners, snapItemToWall, wallMountPose } from '../model/placement3d';
import { detectRooms } from '../model/rooms';
import { uid, type Floor, type Item, type Project, type Vec2 } from '../model/types';
import { activeFloor, useStore } from '../store/store';
import { itemObjects, OutlineBox } from './Items';

interface Pose {
  at: Vec2;
  rotation: number;
  elevation: number;
  /** False if the item would run into a wall or other furniture there. */
  valid: boolean;
}

const GRID = 0.05;

/**
 * Furniture handling in the Interior view: placing a catalog item with a
 * preview that follows the pointer, selecting, dragging, turning and deleting.
 * Works straight on the canvas so it can cooperate with the orbit camera.
 */
export function Decorator({ floor, outdoor }: {
  /** Indoors: the floor being furnished. Outdoors: the ground floor, whose walls things must keep clear of. */
  floor: Floor;
  /** Set when landscaping: the edges of the lot, which everything must stay inside. */
  outdoor?: Rect;
}) {
  const outdoorItems = useStore((s) => s.project.outdoor);
  const items = outdoor ? outdoorItems : floor.items;
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  // Indoors the view is only redrawn on request, so ask whenever the preview is moved by hand.
  const invalidate = useThree((s) => s.invalidate);
  const placing = useStore((s) => s.placing);
  const def = placing ? catalogItem(placing) : undefined;
  const style = useStore((s) => s.project.furnitureStyle ?? 'simple');
  // The piece being placed looks as it will once placed, in the project's furniture style.
  const ghostObject = useMemo(() => (def ? buildDisplayObject(def, undefined, style) : null), [def, style]);
  const ghost = useRef<THREE.Group>(null);
  const [valid, setValid] = useState(true);
  const rooms = useMemo(() => detectRooms(floor.walls), [floor.walls]);
  const placeRotation = useRef(0);

  // The listeners below are attached once; they read the current values through this ref.
  const live = useRef({ floor, rooms, def, controls, items, outdoor });
  live.current = { floor, rooms, def, controls, items, outdoor };

  useEffect(() => {
    placeRotation.current = 0;
    if (ghost.current) ghost.current.visible = false;
    invalidate();
  }, [placing, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    /** A change to the list being edited: the lot's items outdoors, the floor's indoors. */
    const edit = (fn: (list: Item[]) => void) => (p: Project) =>
      fn(live.current.outdoor ? p.outdoor : activeFloor(p, live.current.floor.id).items);

    /** Points the ray from the camera through the pointer. */
    const aim = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      // The camera may have moved since the last frame was drawn; make sure the ray uses where it is now.
      camera.updateMatrixWorld();
      raycaster.setFromCamera(ndc, camera);
    };
    /** Where the ray meets a level surface at height y, as a plan point. */
    const onPlane = (y: number): Vec2 | null => {
      const { origin, direction } = raycaster.ray;
      if (Math.abs(direction.y) < 1e-6) return null;
      const t = (y - origin.y) / direction.y;
      return t > 0 ? { x: origin.x + direction.x * t, y: origin.z + direction.z * t } : null;
    };
    const itemUnderPointer = (ignoreId?: string) => {
      const objects = live.current.items.flatMap((i) => itemObjects.get(i.id) ?? []);
      for (const hit of raycaster.intersectObjects(objects, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData.itemId) o = o.parent;
        const id = o?.userData.itemId as string | undefined;
        if (id && id !== ignoreId) return { id, point: hit.point, onTop: (hit.face?.normal.y ?? 0) > 0.5 };
      }
      return null;
    };
    /** Footprints of the furniture standing on the floor, which new pieces must not overlap. */
    const footprints = (ignoreId?: string): Vec2[][] =>
      live.current.items.flatMap((i) => {
        const d = catalogItem(i.catalogId);
        if (i.id === ignoreId || !d || d.placement !== 'floor' || d.flat) return [];
        return [rectCorners(i.at, d.collide?.w ?? d.size.w, d.collide?.d ?? d.size.d, i.rotation)];
      });

    /** Where an item would go for the current pointer position. */
    const poseFor = (d: CatalogItem, rotation: number, free: boolean, ignoreId?: string, offset?: Vec2): Pose | null => {
      const f = live.current.floor;
      const grid = (v: number) => (free ? v : Math.round(v / GRID) * GRID);
      const { origin, direction } = raycaster.ray;
      if (d.placement === 'wall') {
        const hit = pickWallFace(origin.toArray(), direction.toArray(), f.walls, f.elevation, live.current.rooms.map((r) => r.polygon));
        return hit ? { ...wallMountPose(hit, d.size), valid: true } : null;
      }
      if (d.placement === 'ceiling') {
        const p = onPlane(f.elevation + f.wallHeight);
        return p && { at: { x: grid(p.x), y: grid(p.y) }, rotation, elevation: f.wallHeight - d.size.h, valid: true };
      }
      if (d.placement === 'surface') {
        // Things like lamps and vases sit on whatever furniture is under the pointer, or on the floor.
        const under = itemUnderPointer(ignoreId);
        const host = under && live.current.items.find((i) => i.id === under.id);
        const hostDef = host && catalogItem(host.catalogId);
        if (under && host && hostDef && hostDef.placement === 'floor' && !hostDef.flat) {
          const top = under.onTop ? under.point.y - f.elevation : host.elevation + hostDef.size.h;
          return { at: { x: under.point.x, y: under.point.z }, rotation, elevation: top, valid: true };
        }
        const p = onPlane(f.elevation);
        return p && { at: { x: grid(p.x), y: grid(p.y) }, rotation, elevation: 0, valid: true };
      }
      let p = onPlane(f.elevation);
      if (!p) return null;
      if (offset) p = { x: p.x + offset.x, y: p.y + offset.y };
      const lot = live.current.outdoor;
      const snapped = free || d.flat || lot ? null : snapItemToWall(p, d.size.w, d.size.d, f.walls);
      const at = snapped?.at ?? { x: grid(p.x), y: grid(p.y) };
      const turn = snapped?.rotation ?? rotation;
      const solid = rectCorners(at, d.collide?.w ?? d.size.w, d.collide?.d ?? d.size.d, turn);
      let clear = free || !!d.flat || !isBlocked(solid, f.walls, footprints(ignoreId));
      if (lot) {
        // Outdoors, everything stays on the lot and out of the house, even when placed freely.
        const whole = rectCorners(at, d.size.w, d.size.d, turn);
        const indoors = live.current.rooms.some((r) => [at, ...solid].some((c) => pointInPolygon(c, r.polygon)));
        clear = clear && insideRect(d.collide ? solid : whole, lot) && !indoors;
      }
      return { at, rotation: turn, elevation: 0, valid: clear };
    };

    const showGhost = (pose: Pose | null) => {
      const g = ghost.current;
      if (!g) return;
      g.visible = !!pose;
      invalidate();
      if (!pose) return;
      g.position.set(pose.at.x, live.current.floor.elevation + pose.elevation, pose.at.y);
      g.rotation.y = (-pose.rotation * Math.PI) / 180;
      setValid(pose.valid);
    };

    let drag: { id: string; sx: number; sy: number; started: boolean; offset?: Vec2 } | null = null;
    let pressed: { x: number; y: number } | null = null;
    let lastPointer: PointerEvent | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      aim(e);
      const st = useStore.getState();
      const d = live.current.def;
      if (d) {
        const pose = poseFor(d, placeRotation.current, e.altKey);
        if (!pose?.valid) return;
        const id = uid();
        st.commit(
          edit((list) => void list.push({ id, catalogId: d.id, at: pose.at, elevation: pose.elevation, rotation: pose.rotation })),
        );
        // Hold Shift to keep placing more of the same.
        if (!e.shiftKey) {
          st.setPlacing(null);
          st.select({ kind: 'item', id });
        }
        return;
      }
      const hit = itemUnderPointer();
      if (!hit) {
        pressed = { x: e.clientX, y: e.clientY };
        return;
      }
      st.select({ kind: 'item', id: hit.id });
      const item = live.current.items.find((i) => i.id === hit.id);
      const grabbed = onPlane(live.current.floor.elevation);
      // Remember where on the piece it was grabbed, so it does not jump to the pointer.
      const offset = item && grabbed && item.elevation === 0 ? { x: item.at.x - grabbed.x, y: item.at.y - grabbed.y } : undefined;
      drag = { id: hit.id, sx: e.clientX, sy: e.clientY, started: false, offset };
      if (live.current.controls) live.current.controls.enabled = false;
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      lastPointer = e;
      aim(e);
      const d = live.current.def;
      if (d) {
        showGhost(poseFor(d, placeRotation.current, e.altKey));
        return;
      }
      if (!drag) return;
      const st = useStore.getState();
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
        st.beginTransient();
        drag.started = true;
      }
      const id = drag.id;
      const item = live.current.items.find((i) => i.id === id);
      const itemDef = item && catalogItem(item.catalogId);
      if (!item || !itemDef) return;
      const pose = poseFor(itemDef, item.rotation, e.altKey, id, itemDef.placement === 'floor' ? drag.offset : undefined);
      // If the new spot is blocked the piece simply stays where it last fitted.
      if (!pose?.valid) return;
      st.transient(
        edit((list) => {
          const x = list.find((i) => i.id === id);
          if (x) Object.assign(x, { at: pose.at, rotation: pose.rotation, elevation: pose.elevation });
        }),
      );
    };

    const onUp = (e: PointerEvent) => {
      if (drag) {
        drag = null;
        if (live.current.controls) live.current.controls.enabled = true;
      } else if (pressed && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 4 && !live.current.def) {
        // A plain click on the floor selects that room, so its finishes can be changed.
        aim(e);
        const p = onPlane(live.current.floor.elevation);
        const inRoom = p && !live.current.outdoor && live.current.rooms.some((r) => pointInPolygon(p, r.polygon));
        useStore.getState().select(p && inRoom ? { kind: 'room', at: p } : null);
      }
      pressed = null;
    };

    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches?.('input, select, textarea')) return;
      const st = useStore.getState();
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' || key === 'y') {
          e.preventDefault();
          if (key === 'y' || e.shiftKey) st.redo();
          else st.undo();
        }
        return;
      }
      const selected = st.selection?.kind === 'item' ? st.selection.id : null;
      if (key === 'escape') {
        if (live.current.def) st.setPlacing(null);
        else st.select(null);
      } else if ((key === 'delete' || key === 'backspace') && selected) {
        st.commit(
          edit((list) => {
            const at = list.findIndex((i) => i.id === selected);
            if (at >= 0) list.splice(at, 1);
          }),
        );
        st.select(null);
      } else if (key === 't') {
        // T turns a quarter; Shift+T turns a little.
        const turn = e.shiftKey ? 15 : 90;
        if (live.current.def) {
          placeRotation.current = (placeRotation.current + turn) % 360;
          if (lastPointer) onMove(lastPointer);
        } else if (selected) {
          st.commit(
            edit((list) => {
              const x = list.find((i) => i.id === selected);
              if (x) x.rotation = (x.rotation + turn) % 360;
            }),
          );
        }
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      if (live.current.controls) live.current.controls.enabled = true;
    };
  }, [gl, camera, invalidate]);

  return (
    <group ref={ghost} visible={false}>
      {ghostObject && <primitive object={ghostObject} />}
      {def && <OutlineBox size={def.size} color={valid ? '#2f6fdb' : '#c0392b'} />}
    </group>
  );
}
