import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_WALL_THICKNESS,
  FEATURE_DEFAULTS,
  OPENING_DEFAULTS,
  uid,
  type FeatureType,
  type Floor,
  type OpeningType,
  type Project,
  type Vec2,
} from '../model/types';
import { catalogItem } from '../catalog/catalog';
import { add, dist, normalize, pointInPolygon, scale, sub } from '../model/geometry';
import { floorAt } from '../model/floors';
import { detectRooms, roomName } from '../model/rooms';
import { formatArea, formatLength, gridSteps, parseLength, snapStep } from '../model/units';
import { activeFloor, useActiveFloor, useStore, type Tool } from '../store/store';
import { FloorSwitcher } from './FloorSwitcher';
import { findOpeningSpot, placeFeature, type OpeningSpot } from './placement';
import { snapPoint, snapToGrid, type SnapResult } from './snap';
import { FeatureSymbol, OpeningSymbol } from './symbols';
import { endsAt, endsAttachedTo, pointsAttr, touchesOtherWall, wallOutline, type WallEnd } from './wallShape';

interface View {
  /** Screen position of the plan origin, in pixels. */
  x: number;
  y: number;
  /** Pixels per metre. */
  zoom: number;
}

type DragBase = { sx: number; sy: number; started: boolean };
type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number; moved: boolean; hit: 'room' | 'empty'; world: Vec2 }
  | (DragBase & {
      kind: 'move';
      start: Vec2;
      anchor: Vec2;
      parts: WallEnd[];
      exclude: Set<string>;
      /**
       * Whole-wall drags slide only along this direction (square to the wall), so the
       * walls joined to it stay straight. Null for corner drags, which move freely.
       */
      normal: Vec2 | null;
    })
  | (DragBase & { kind: 'opening'; id: string })
  | (DragBase & { kind: 'feature'; id: string; start: Vec2; orig: Vec2 })
  | { kind: 'rect'; sx: number; sy: number };

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const isOpeningTool = (tool: Tool): tool is OpeningType => tool in OPENING_DEFAULTS;
const isFeatureTool = (tool: Tool): tool is FeatureType => tool in FEATURE_DEFAULTS;

const HINTS: Record<Tool, string> = {
  select: 'Click anything to select it. Drag walls, doors, windows and stairs to move them. Drag the paper to pan.',
  wall: 'Click to start a wall. Hold Alt to turn off snapping.',
  rect: 'Drag, or click two corners, to draw a rectangular room.',
  door: 'Click on a wall to add a door. It opens toward the side your cursor is on.',
  window: 'Click on a wall to add a window.',
  archway: 'Click on a wall to add an open archway.',
  stairs: 'Click to place stairs going up to the next floor. Press T to turn them.',
  fireplace: 'Click near a wall to place a fireplace against it.',
  column: 'Click to place a column.',
  erase: 'Click a wall, door, window or other item to remove it.',
};
const CHAIN_HINT = 'Click to add a corner · type a length and press Enter · double-click or Esc to finish';

const SHORTCUTS: Record<string, Tool> = {
  v: 'select', w: 'wall', r: 'rect', d: 'door', n: 'window', a: 'archway', s: 'stairs', f: 'fireplace', c: 'column', e: 'erase',
};

export function PlanEditor() {
  const floor = useActiveFloor();
  const floorId = floor.id;
  const below = useStore((s) => floorAt(s.project, floor.level - 1));
  const units = useStore((s) => s.project.units);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const showDimensions = useStore((s) => s.showDimensions);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 60 });
  const [cursor, setCursor] = useState<SnapResult | null>(null);
  const [mouse, setMouse] = useState<Vec2 | null>(null);
  const [chain, setChain] = useState<{ from: Vec2; first: Vec2 } | null>(null);
  const [rectFrom, setRectFrom] = useState<Vec2 | null>(null);
  const [typed, setTyped] = useState('');
  const [spot, setSpot] = useState<OpeningSpot | null>(null);
  const [featureSpot, setFeatureSpot] = useState<{ at: Vec2; rotation: number } | null>(null);
  const [placeRotation, setPlaceRotation] = useState(0);
  const drag = useRef<Drag | null>(null);
  const spaceHeld = useRef(false);

  const walls = floor.walls;
  const rooms = useMemo(() => detectRooms(walls), [walls]);
  const outlines = useMemo(
    () =>
      walls.map((w) => ({
        wall: w,
        outline: wallOutline(w, touchesOtherWall(w.a, w, walls), touchesOtherWall(w.b, w, walls)),
      })),
    [walls],
  );
  const belowOutlines = useMemo(() => {
    const ws = below?.walls ?? [];
    return ws.map((w) => wallOutline(w, touchesOtherWall(w.a, w, ws), touchesOtherWall(w.b, w, ws)));
  }, [below?.walls]);
  // Corners and walls of the floor below are snap targets too, so a floor can be traced over it.
  const snapWalls = useMemo(() => (below ? [...walls, ...below.walls] : walls), [walls, below]);
  const wallById = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls]);

  const step = snapStep(view.zoom, units);
  const editFloor = (fn: (f: Floor) => void) => (p: Project) => fn(activeFloor(p, floorId));
  const toScreen = (p: Vec2): Vec2 => ({ x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y });
  const toWorld = (s: Vec2): Vec2 => ({ x: (s.x - view.x) / view.zoom, y: (s.y - view.y) / view.zoom });
  const screenPoint = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const snap = (raw: Vec2, from?: Vec2, disabled?: boolean, exclude?: Set<string>): SnapResult =>
    snapPoint(raw, { walls: snapWalls, from, exclude, disabled, zoom: view.zoom, step });

  const cancelDrawing = () => {
    setChain(null);
    setRectFrom(null);
    setTyped('');
  };

  const fit = () => {
    // Measure the pane directly: it may have just been resized (the 3D preview opening beside it).
    const size = { w: wrapRef.current?.clientWidth ?? 0, h: wrapRef.current?.clientHeight ?? 0 };
    if (!size.w) return;
    const source = walls.length ? walls : (below?.walls ?? []);
    const pts = source.flatMap((w) => [w.a, w.b]);
    if (!pts.length) {
      setView({ x: size.w / 2, y: size.h / 2, zoom: 60 });
      return;
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // Leave a margin around the plan, but never more than the pane can spare.
    const usable = (px: number) => px - Math.min(200, px * 0.3);
    const zoom = clamp(
      Math.min(usable(size.w) / Math.max(maxX - minX, 1), usable(size.h) / Math.max(maxY - minY, 1)),
      10,
      150,
    );
    setView({ zoom, x: size.w / 2 - ((minX + maxX) / 2) * zoom, y: size.h / 2 - ((minY + maxY) / 2) * zoom });
  };

  const zoomAt = (sx: number, sy: number, factor: number) =>
    setView((v) => {
      const zoom = clamp(v.zoom * factor, 5, 400);
      const k = zoom / v.zoom;
      return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
    });

  // Track the canvas size. Measured once up front so the first frame is already framed.
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Frame the plan when the editor first appears. Switching floors keeps the view, so floors line up.
  const ready = size.w > 0;
  const projectKey = useStore((s) => s.loads);
  useEffect(() => {
    if (ready) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, projectKey]);

  // Wheel zoom needs a non-passive listener so the page does not scroll.
  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    cancelDrawing();
    setCursor(null);
    setSpot(null);
    setFeatureSpot(null);
    setPlaceRotation(0);
  }, [tool, floorId]);

  const placeWallPoint = (p: Vec2) => {
    if (!chain) {
      setChain({ from: p, first: p });
      return;
    }
    if (dist(p, chain.from) < 0.01) {
      cancelDrawing();
      return;
    }
    const from = chain.from;
    useStore.getState().commit(
      editFloor((f) => {
        f.walls.push({ id: uid(), a: { ...from }, b: { ...p }, thickness: DEFAULT_WALL_THICKNESS, height: f.wallHeight });
      }),
    );
    if (dist(p, chain.first) < 1e-3) cancelDrawing();
    else setChain({ ...chain, from: p });
  };

  const commitTyped = () => {
    const len = parseLength(typed, units);
    setTyped('');
    if (!len || !chain || !cursor) return;
    const dir = normalize(sub(cursor.point, chain.from));
    if (!dir.x && !dir.y) return;
    placeWallPoint(add(chain.from, scale(dir, len)));
  };

  const commitRect = (p: Vec2, q: Vec2) => {
    if (Math.abs(p.x - q.x) < 0.05 || Math.abs(p.y - q.y) < 0.05) return;
    const corners = [p, { x: q.x, y: p.y }, q, { x: p.x, y: q.y }];
    useStore.getState().commit(
      editFloor((f) => {
        corners.forEach((c, i) => {
          const next = corners[(i + 1) % 4];
          f.walls.push({ id: uid(), a: { ...c }, b: { ...next }, thickness: DEFAULT_WALL_THICKNESS, height: f.wallHeight });
        });
      }),
    );
    setRectFrom(null);
  };

  const remove = (kind: 'wall' | 'opening' | 'feature', id: string) => {
    const st = useStore.getState();
    st.commit(
      editFloor((f) => {
        if (kind === 'wall') f.walls = f.walls.filter((w) => w.id !== id);
        else if (kind === 'opening') f.openings = f.openings.filter((o) => o.id !== id);
        else f.features = f.features.filter((x) => x.id !== id);
      }),
    );
    st.select(null);
  };

  // Keyboard shortcuts. The ref keeps the listener pointed at the latest state.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    const st = useStore.getState();
    const key = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (key === 'z' || key === 'y') {
        e.preventDefault();
        cancelDrawing();
        if (key === 'y' || e.shiftKey) st.redo();
        else st.undo();
      }
      return;
    }
    if (e.code === 'Space') {
      spaceHeld.current = true;
      e.preventDefault();
      return;
    }
    const drawing = tool === 'wall' && chain !== null;
    if (drawing && /^[0-9.'"]$/.test(e.key)) {
      setTyped((t) => t + e.key);
      e.preventDefault();
      return;
    }
    if (key === 'escape') {
      if (chain || rectFrom || typed) cancelDrawing();
      else if (tool !== 'select') st.setTool('select');
      else st.select(null);
    } else if (key === 'enter' && drawing) {
      if (typed) commitTyped();
      else cancelDrawing();
    } else if (key === 'backspace' || key === 'delete') {
      if (typed) setTyped((t) => t.slice(0, -1));
      else if (selection && selection.kind !== 'room' && selection.kind !== 'item') remove(selection.kind, selection.id);
    } else if (key === 't') {
      // Turn the stairs (or other item) about to be placed, or the selected one, by a quarter.
      if (isFeatureTool(tool)) {
        setPlaceRotation((r) => (r + 90) % 360);
        setFeatureSpot((s) => s && { ...s, rotation: (s.rotation + 90) % 360 });
      } else if (selection?.kind === 'feature') {
        const id = selection.id;
        st.commit(
          editFloor((f) => {
            const x = f.features.find((y) => y.id === id);
            if (x) x.rotation = (x.rotation + 90) % 360;
          }),
        );
      }
    } else if (SHORTCUTS[key]) st.setTool(SHORTCUTS[key]);
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => onKey.current(e);
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const s = screenPoint(e);
    const raw = toWorld(s);
    const st = useStore.getState();
    const target = e.target as Element;
    e.currentTarget.setPointerCapture(e.pointerId);
    const startPan = (hit: 'room' | 'empty') => {
      drag.current = { kind: 'pan', sx: s.x, sy: s.y, ox: view.x, oy: view.y, moved: false, hit, world: raw };
    };

    if (e.button === 2 && tool === 'wall' && chain) {
      cancelDrawing();
      return;
    }
    if (e.button !== 0 || spaceHeld.current) {
      startPan('empty');
      return;
    }

    const wallId = target.getAttribute('data-wall');
    const openingId = target.getAttribute('data-opening');
    const featureId = target.getAttribute('data-feature');
    const base = { sx: s.x, sy: s.y, started: false };

    if (tool === 'select') {
      const handle = target.getAttribute('data-handle');
      const wall = wallById.get(handle ? handle.split(':')[0] : (wallId ?? ''));
      const feature = floor.features.find((f) => f.id === featureId);
      if (handle && wall) {
        const anchor = handle.endsWith(':a') ? wall.a : wall.b;
        const parts = endsAt(anchor, walls);
        drag.current = {
          ...base, kind: 'move', start: raw, anchor, parts, exclude: new Set(parts.map((p) => p.wallId)), normal: null,
        };
      } else if (openingId) {
        st.select({ kind: 'opening', id: openingId });
        drag.current = { ...base, kind: 'opening', id: openingId };
      } else if (feature) {
        st.select({ kind: 'feature', id: feature.id });
        drag.current = { ...base, kind: 'feature', id: feature.id, start: raw, orig: feature.at };
      } else if (wall) {
        st.select({ kind: 'wall', id: wall.id });
        const dir = normalize(sub(wall.b, wall.a));
        drag.current = {
          ...base, kind: 'move', start: raw, anchor: wall.a, parts: endsAttachedTo(wall, walls),
          exclude: new Set(), normal: { x: -dir.y, y: dir.x },
        };
      } else {
        startPan(target.hasAttribute('data-room') ? 'room' : 'empty');
      }
    } else if (tool === 'erase') {
      if (openingId) remove('opening', openingId);
      else if (featureId) remove('feature', featureId);
      else if (wallId) remove('wall', wallId);
      else startPan('empty');
    } else if (tool === 'wall') {
      placeWallPoint(snap(raw, chain?.from, e.altKey).point);
    } else if (tool === 'rect') {
      const p = snap(raw, undefined, e.altKey).point;
      if (rectFrom) commitRect(rectFrom, p);
      else {
        setRectFrom(p);
        drag.current = { kind: 'rect', sx: s.x, sy: s.y };
      }
    } else if (isOpeningTool(tool)) {
      const defaults = OPENING_DEFAULTS[tool];
      const found = findOpeningSpot(raw, defaults.width, floor, { zoom: view.zoom, step, free: e.altKey });
      if (found?.valid) {
        st.commit(
          editFloor((f) => {
            f.openings.push({
              id: uid(), type: tool, ...defaults, wallId: found.wallId, offset: found.offset, side: found.side, hingeAtB: false,
            });
          }),
        );
      }
    } else if (isFeatureTool(tool)) {
      const defaults = FEATURE_DEFAULTS[tool];
      const placed = placeFeature(raw, { type: tool, ...defaults, rotation: placeRotation }, walls, {
        zoom: view.zoom, step, free: e.altKey,
      });
      const id = uid();
      st.commit(editFloor((f) => void f.features.push({ id, type: tool, ...defaults, ...placed })));
      // Hand over to the Select tool so the new item can be adjusted straight away.
      st.setTool('select');
      st.select({ kind: 'feature', id });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = screenPoint(e);
    const raw = toWorld(s);
    setMouse(raw);
    const d = drag.current;
    const st = useStore.getState();
    if (d?.kind === 'pan') {
      if (Math.hypot(s.x - d.sx, s.y - d.sy) > 3) d.moved = true;
      if (d.moved) setView((v) => ({ ...v, x: d.ox + s.x - d.sx, y: d.oy + s.y - d.sy }));
      return;
    }
    if (d && d.kind !== 'rect') {
      if (!d.started) {
        if (Math.hypot(s.x - d.sx, s.y - d.sy) < 3) return;
        st.beginTransient();
        d.started = true;
      }
      if (d.kind === 'opening') {
        const opening = floor.openings.find((o) => o.id === d.id);
        if (!opening) return;
        const found = findOpeningSpot(raw, opening.width, floor, { zoom: view.zoom, step, ignoreId: d.id, free: e.altKey });
        if (!found?.valid) return;
        st.transient(
          editFloor((f) => {
            const o = f.openings.find((x) => x.id === d.id);
            if (o) Object.assign(o, { wallId: found.wallId, offset: found.offset });
          }),
        );
        return;
      }
      if (d.kind === 'feature') {
        const feature = floor.features.find((f) => f.id === d.id);
        if (!feature) return;
        const placed = placeFeature(add(d.orig, sub(raw, d.start)), feature, walls, { zoom: view.zoom, step, free: e.altKey });
        st.transient(
          editFloor((f) => {
            const x = f.features.find((y) => y.id === d.id);
            if (x) Object.assign(x, placed);
          }),
        );
        return;
      }
      const moved = sub(raw, d.start);
      let delta: Vec2;
      if (!d.normal) {
        const result = snap(add(d.anchor, moved), undefined, e.altKey, d.exclude);
        setCursor(result);
        delta = sub(result.point, d.anchor);
      } else {
        const n = d.normal;
        let k = moved.x * n.x + moved.y * n.y;
        if (!e.altKey) {
          // Horizontal and vertical walls land on grid lines; slanted ones move in grid steps.
          const landed = snapToGrid(add(d.anchor, scale(n, k)), step);
          if (Math.abs(n.x) > 0.999) k = (landed.x - d.anchor.x) / n.x;
          else if (Math.abs(n.y) > 0.999) k = (landed.y - d.anchor.y) / n.y;
          else k = Math.round(k / step) * step;
        }
        delta = scale(n, k);
      }
      st.transient(
        editFloor((f) => {
          for (const part of d.parts) {
            const w = f.walls.find((x) => x.id === part.wallId);
            if (w) w[part.end] = add(part.orig, delta);
          }
        }),
      );
      return;
    }
    if (tool === 'wall') setCursor(snap(raw, chain?.from, e.altKey));
    else if (tool === 'rect') setCursor(snap(raw, undefined, e.altKey));
    else if (isOpeningTool(tool)) {
      setSpot(findOpeningSpot(raw, OPENING_DEFAULTS[tool].width, floor, { zoom: view.zoom, step, free: e.altKey }));
    } else if (isFeatureTool(tool)) {
      setFeatureSpot(
        placeFeature(raw, { type: tool, ...FEATURE_DEFAULTS[tool], rotation: placeRotation }, walls, {
          zoom: view.zoom, step, free: e.altKey,
        }),
      );
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const s = screenPoint(e);
    const st = useStore.getState();
    if (d.kind === 'pan' && !d.moved && tool === 'select') {
      st.select(d.hit === 'room' ? { kind: 'room', at: d.world } : null);
    } else if (d.kind === 'move' && d.started) {
      // Dragging a corner onto its neighbour leaves a wall with no length: remove it.
      st.transient(
        editFloor((f) => {
          if (f.walls.some((w) => dist(w.a, w.b) < 0.01)) f.walls = f.walls.filter((w) => dist(w.a, w.b) >= 0.01);
        }),
      );
      setCursor(null);
    } else if (d.kind === 'rect' && rectFrom && Math.hypot(s.x - d.sx, s.y - d.sy) > 4) {
      commitRect(rectFrom, snap(toWorld(s), undefined, e.altKey).point);
    }
  };

  const grid = gridSteps(view.zoom, units);
  const minorPx = grid.minor * view.zoom;
  const majorPx = grid.major * view.zoom;
  const selectedWall = selection?.kind === 'wall' ? wallById.get(selection.id) : undefined;
  const selectedRoom = selection?.kind === 'room' ? rooms.find((r) => pointInPolygon(selection.at, r.polygon)) : undefined;
  const selectedId = selection && selection.kind !== 'room' ? selection.id : null;
  const preview = tool === 'wall' && chain && cursor && dist(chain.from, cursor.point) > 0.01
    ? { a: chain.from, b: cursor.point, thickness: DEFAULT_WALL_THICKNESS }
    : null;
  const rectTo = tool === 'rect' && rectFrom && cursor ? cursor.point : null;
  const showMarker = cursor && (tool === 'wall' || tool === 'rect' || drag.current?.kind === 'move');
  const spotWall = isOpeningTool(tool) && spot ? wallById.get(spot.wallId) : undefined;
  const drawingTool = tool !== 'select' && tool !== 'erase';
  const hint = tool === 'wall' && chain ? CHAIN_HINT : HINTS[tool];
  const isEmpty = walls.length === 0 && floor.features.length === 0 && !chain && !rectFrom;

  /** A length label lying along a segment, kept the right way up. */
  const lengthLabel = (a: Vec2, b: Vec2, offsetPx: number, className: string, key: string, text?: string) => {
    const sa = toScreen(a);
    const sb = toScreen(b);
    let angle = (Math.atan2(sb.y - sa.y, sb.x - sa.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;
    return (
      <text
        key={key}
        className={className}
        textAnchor="middle"
        transform={`translate(${(sa.x + sb.x) / 2} ${(sa.y + sb.y) / 2}) rotate(${angle})`}
        y={-offsetPx}
      >
        {text ?? formatLength(dist(a, b), units)}
      </text>
    );
  };

  return (
    <div className={`plan-canvas tool-${tool}${drawingTool ? ' drawing' : ''}`} ref={wrapRef}>
      <svg
        width="100%"
        height="100%"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setMouse(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="grid-minor" width={minorPx} height={minorPx} patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y})`}>
            <path d={`M ${minorPx} 0 H 0 V ${minorPx}`} className="grid-minor" />
          </pattern>
          <pattern id="grid-major" width={majorPx} height={majorPx} patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y})`}>
            <path d={`M ${majorPx} 0 H 0 V ${majorPx}`} className="grid-major" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" className="paper" />
        <rect width="100%" height="100%" fill="url(#grid-minor)" />
        <rect width="100%" height="100%" fill="url(#grid-major)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {/* The floor below, faint, for lining things up. Its stairs arrive on this floor. */}
          {belowOutlines.map((outline, i) => (
            <polygon key={i} className="wall below" points={pointsAttr(outline)} />
          ))}
          {rooms.map((r, i) => (
            <polygon key={i} data-room="" className={r === selectedRoom ? 'room selected' : 'room'} points={pointsAttr(r.inner)} />
          ))}
          {below?.features
            .filter((f) => f.type === 'stairs')
            .map((f) => <FeatureSymbol key={f.id} feature={f} state="stairwell" />)}
          {floor.items.map((item) => {
            const def = catalogItem(item.catalogId);
            return def && (
              <g key={item.id} className="item-footprint" transform={`translate(${item.at.x} ${item.at.y}) rotate(${item.rotation})`}>
                <rect x={-def.size.w / 2} y={-def.size.d / 2} width={def.size.w} height={def.size.d} />
                <line x1={-def.size.w / 2} y1={def.size.d / 2} x2={def.size.w / 2} y2={def.size.d / 2} />
              </g>
            );
          })}
          {floor.features.map((f) => (
            <FeatureSymbol key={f.id} feature={f} interactive state={f.id === selectedId ? 'selected' : ''} />
          ))}
          {outlines.map(({ wall, outline }) => (
            <polygon key={wall.id} className={wall === selectedWall ? 'wall selected' : 'wall'} points={pointsAttr(outline)} />
          ))}
          {walls.map((w) => (
            <line key={w.id} data-wall={w.id} className="wall-hit" x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y}
              strokeWidth={Math.max(w.thickness, 14 / view.zoom)} />
          ))}
          {floor.openings.map((o) => {
            const wall = wallById.get(o.wallId);
            return wall && (
              <OpeningSymbol key={o.id} opening={o} wall={wall} hitPad={8 / view.zoom} state={o.id === selectedId ? 'selected' : ''} />
            );
          })}
          {preview && <polygon className="wall preview" points={pointsAttr(wallOutline(preview, false, false))} />}
          {rectFrom && rectTo && (
            <rect className="rect-preview" strokeWidth={DEFAULT_WALL_THICKNESS}
              x={Math.min(rectFrom.x, rectTo.x)} y={Math.min(rectFrom.y, rectTo.y)}
              width={Math.abs(rectTo.x - rectFrom.x)} height={Math.abs(rectTo.y - rectFrom.y)} />
          )}
          {isOpeningTool(tool) && spot && spotWall && (
            <OpeningSymbol
              opening={{ type: tool, width: OPENING_DEFAULTS[tool].width, offset: spot.offset, side: spot.side, hingeAtB: false }}
              wall={spotWall}
              state={spot.valid ? 'preview' : 'preview invalid'}
            />
          )}
          {isFeatureTool(tool) && featureSpot && (
            <FeatureSymbol feature={{ type: tool, ...FEATURE_DEFAULTS[tool], ...featureSpot }} state="preview" />
          )}
        </g>

        <g className="overlay">
          {rooms.map((r, i) => {
            const c = toScreen(r.centroid);
            const widthPx = (Math.max(...r.inner.map((p) => p.x)) - Math.min(...r.inner.map((p) => p.x))) * view.zoom;
            if (widthPx < 70) return null;
            return (
              <text key={i} className="room-label" textAnchor="middle" x={c.x} y={c.y}>
                <tspan x={c.x} dy="-0.2em" className="room-name">{roomName(r, floor.labels)}</tspan>
                <tspan x={c.x} dy="1.3em">{formatArea(r.area, units)}</tspan>
              </text>
            );
          })}
          {showDimensions &&
            walls.map((w) =>
              dist(w.a, w.b) * view.zoom < 46 ? null : lengthLabel(w.a, w.b, (w.thickness / 2) * view.zoom + 5, 'dimension', w.id),
            )}
          {cursor?.guides.map((g, i) => {
            const a = toScreen(g.from);
            const b = toScreen(g.to);
            return <line key={i} className="guide" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          {preview &&
            lengthLabel(preview.a, preview.b, 12, 'dimension live', 'live', typed ? `${typed}▏` : undefined)}
          {rectFrom && rectTo && (
            <>
              {lengthLabel(rectFrom, { x: rectTo.x, y: rectFrom.y }, 12, 'dimension live', 'rw')}
              {lengthLabel({ x: rectTo.x, y: rectFrom.y }, rectTo, 12, 'dimension live', 'rh')}
            </>
          )}
          {selectedWall &&
            (['a', 'b'] as const).map((end) => {
              const p = toScreen(selectedWall[end]);
              return <circle key={end} data-handle={`${selectedWall.id}:${end}`} className="handle" cx={p.x} cy={p.y} r={6} />;
            })}
          {showMarker && cursor && (() => {
            const p = toScreen(cursor.point);
            return cursor.kind === 'endpoint' ? (
              <rect className="snap-marker" x={p.x - 5} y={p.y - 5} width={10} height={10} />
            ) : (
              <circle className="snap-marker" cx={p.x} cy={p.y} r={cursor.kind === 'wall' ? 5 : 3.5} />
            );
          })()}
        </g>
      </svg>

      {isEmpty && (
        <div className="empty-hint">
          {below?.walls.length ? (
            <>
              <strong>{floor.name} is empty</strong>
              <span>The floor below is shown in grey. Trace over it, or use “Copy walls from floor below” on the right.</span>
            </>
          ) : (
            <>
              <strong>Start your floor plan</strong>
              <span>Pick the Wall or Room tool on the left, then click on the paper to draw.</span>
            </>
          )}
        </div>
      )}

      <FloorSwitcher />
      <div className="status">
        <span>{hint}</span>
        {mouse && (
          <span className="coords">
            {formatLength(mouse.x, units)}, {formatLength(mouse.y, units)}
          </span>
        )}
      </div>
      <div className="zoom-controls">
        <button title="Zoom out" onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.3)}>−</button>
        <button title="Fit plan to screen" className="wide" onClick={fit}>Fit</button>
        <button title="Zoom in" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.3)}>+</button>
      </div>
    </div>
  );
}
