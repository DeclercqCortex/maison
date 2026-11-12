import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor, Sky } from '@react-three/drei';
import { fileStem, saveFile } from '../store/persistence';
import { sceneApi, SceneApi } from './SceneApi';
import * as THREE from 'three';
import { catalogItem } from '../catalog/catalog';
import { floorAt } from '../model/floors';
import { towerLayout } from '../model/building';
import { Tower } from './Tower';
import { lotRect, lotSize, wallBounds } from '../model/lot';
import { detectRooms } from '../model/rooms';
import type { Floor, Vec2 } from '../model/types';
import { FloorSwitcher } from '../plan/FloorSwitcher';
import { useActiveFloor, useStore } from '../store/store';
import { Decorator } from './Decorator';
import { FloorModel } from './House';
import { setReflective } from '../catalog/build';
import { ItemModel, ModelWatcher } from './Items';
import { RayTracer } from './RayTracer';
import { DistantTrees, Grass, LotFence, Terrain } from './Landscape';
import { City } from './City';
import { planCity } from '../model/city';
import { Roof } from './Roof';
import { WalkControls } from './Walk';

interface Bounds {
  centre: [number, number, number];
  /** Rough half-size of what is shown, for placing the camera. */
  radius: number;
  /** Furthest any wall reaches from the plan origin, for sizing the shadow area. */
  reach: number;
}

function boundsOf(floors: Floor[]): Bounds {
  const pts = floors.flatMap((f) => f.walls.flatMap((w) => [w.a, w.b]));
  if (!pts.length) return { centre: [0, 1, 0], radius: 7, reach: 10 };
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.y);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const minY = Math.min(...floors.map((f) => f.elevation));
  const maxY = Math.max(...floors.map((f) => f.elevation + f.wallHeight));
  return {
    centre: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    radius: Math.max(4, Math.hypot(maxX - minX, maxZ - minZ, maxY - minY) / 2),
    reach: Math.max(...xs.map(Math.abs), ...zs.map(Math.abs)),
  };
}

/** Orbit camera. Re-frames only when `frameKey` changes, so edits to the plan do not move the view. */
function CameraRig({ frameKey, bounds, steep, view, far = 250, shot, glide }: {
  frameKey: string; bounds: Bounds; steep: boolean;
  /** Direction to the camera from what it looks at, scaled by the size of the view. */
  view?: [number, number, number];
  /** How far the camera may be pulled back. */
  far?: number;
  /** Exact camera and target positions, instead of working them out from `bounds` and `view`. */
  shot?: { from: [number, number, number]; target: [number, number, number] };
  /** Glide to the new view rather than jumping there. */
  glide?: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const latest = useRef(bounds);
  latest.current = bounds;
  const aspect = useRef(1);
  aspect.current = useThree((s) => s.size.width / Math.max(1, s.size.height));
  /** A glide in progress: where the camera and its target start and end, and when it began. */
  const flight = useRef<{ from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; start: number } | null>(null);
  useFrame(({ clock }) => {
    const f = flight.current;
    const c = controls.current;
    if (!f || !c) return;
    const t = Math.min(1, (clock.elapsedTime - f.start) / 2.2);
    const ease = t * t * (3 - 2 * t);
    // Rise up a little on the way, so the camera arcs over the city rather than ploughing through it.
    camera.position.lerpVectors(f.from, f.to, ease);
    camera.position.y += Math.sin(Math.PI * ease) * f.from.distanceTo(f.to) * 0.18;
    c.target.lerpVectors(f.lookFrom, f.lookTo, ease);
    c.update();
    if (t >= 1) flight.current = null;
  });
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    if (shot) {
      if (glide && controls.current) {
        flight.current = {
          from: camera.position.clone(), to: new THREE.Vector3(...shot.from),
          lookFrom: controls.current.target.clone(), lookTo: new THREE.Vector3(...shot.target), start: clock.elapsedTime,
        };
        return;
      }
      flight.current = null;
      camera.position.set(...shot.from);
      controls.current?.target.set(...shot.target);
      controls.current?.update();
      return;
    }
    const { centre, radius } = latest.current;
    // Indoors, start high up so you look down into the rooms over the near walls.
    const [dx, dy, dz] = view ?? (steep ? [0.6, 2.2, 1.2] : [1.7, 1.0, 2.4]);
    // A tall, narrow view needs the camera further back to fit the house in.
    const back = radius * Math.max(1, 1 / aspect.current);
    camera.position.set(centre[0] + back * dx, centre[1] + back * dy, centre[2] + back * dz);
    controls.current?.target.set(...centre);
    controls.current?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, camera, steep]);
  return (
    <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 2 - 0.03} minDistance={1.5}
      maxDistance={Math.max(far, bounds.radius * 6)} />
  );
}

const DAY_SKY = { interior: '#e9edf1', exterior: '#d3e2ee' };
const NIGHT_SKY = '#141a26';
const NO_HOLES: [number, number, number][] = [];

/**
 * The 3D view of the house, built live from the plan.
 * Interior: the floor being edited, with no ceiling so you can look in and furnish it.
 * Exterior: every floor stacked, standing on the ground.
 */
export default function Scene3D({ mode, compact }: { mode: 'interior' | 'exterior'; compact?: boolean }) {
  const project = useStore((s) => s.project);
  const loads = useStore((s) => s.loads);
  const selection = useStore((s) => s.selection);
  const placing = useStore((s) => s.placing);
  const walking = useStore((s) => s.walk) && mode === 'interior' && !compact;
  const active = useActiveFloor();
  const floors = useMemo(() => (mode === 'interior' ? [active] : project.floors), [mode, active, project.floors]);
  const outdoors = mode === 'exterior';
  const apartment = project.kind === 'apartment';
  // Outside an apartment, the whole block is shown rather than just the flat.
  const tower = useMemo(() => (outdoors ? towerLayout(project) : null), [outdoors, project]);
  const bounds = useMemo<Bounds>(() => {
    if (!tower) return boundsOf(floors);
    const r = tower.rect;
    return {
      centre: [(r.minX + r.maxX) / 2, tower.height / 2, (r.minY + r.maxY) / 2],
      radius: Math.max(4, Math.hypot(r.maxX - r.minX, r.maxY - r.minY, tower.height) / 2),
      reach: Math.max(Math.abs(r.minX), Math.abs(r.maxX), Math.abs(r.minY), Math.abs(r.maxY), tower.height * 0.7),
    };
  }, [tower, floors]);
  // How far below the apartment's floor the ground is (none for a house).
  // The city around an apartment (a house stands in the countryside instead).
  const city = useMemo(() => (apartment ? planCity(project.lot) : null), [apartment, project.lot]);
  // How far below the apartment's floor the ground is (none for a house).
  const drop = useMemo(() => towerLayout(project)?.base ?? 0, [project]);
  // Outside an apartment, start almost level with the top of the block, looking past it across the
  // city toward the Empire State Building and the harbour.
  // The landmark buttons glide the camera to a view of each one.
  const [landmark, setLandmark] = useState<{ which: 'home' | 'empire' | 'liberty'; n: number }>({ which: 'home', n: 0 });
  const cityShot = useMemo(() => {
    if (!city || !tower) return undefined;
    const [x, , z] = bounds.centre;
    type V = [number, number, number];
    if (landmark.which === 'empire') {
      // From the apartment's side, far enough back to fit the whole 443 m.
      const { x: ex, z: ez } = city.empireState;
      const away = new THREE.Vector2(x - ex, z - ez).normalize();
      return { target: [ex, 230, ez] as V, from: [ex + away.x * 560, 250, ez + away.y * 560] as V };
    }
    if (landmark.which === 'liberty') {
      // She faces the city, so look at her from the city side.
      const { x: lx, z: lz } = city.liberty;
      const toward = new THREE.Vector2(x - lx, z - lz).normalize();
      return { target: [lx, 55, lz] as V, from: [lx + toward.x * 190, 75, lz + toward.y * 190] as V };
    }
    const y = tower.height * 0.7 + 15;
    const back = Math.max(260, bounds.radius * 4);
    // Nearly level, so the skyline and the top of the Empire State Building fit in behind the block.
    const dir = new THREE.Vector3(1, 0.03, 1).normalize().multiplyScalar(back);
    return { target: [x, y, z] as V, from: [x + dir.x, y + dir.y, z + dir.z] as V };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, tower?.height, loads, landmark]);
  const lot = project.lot;
  const ground = floorAt(project, 0) ?? project.floors[0];
  // Outdoors the shadows must reach the garden as well as the house.
  const { width: lotWidth, depth: lotDepth } = lotSize(lot);
  const shadow = outdoors ? Math.max(bounds.reach + 8, Math.min(Math.hypot(lotWidth, lotDepth) / 2, 70)) : bounds.reach + 8;
  const lotEdges = useMemo(() => lotRect(lot), [lot]);
  const houseArea = useMemo(() => {
    const b = tower ? tower.rect : wallBounds(ground);
    return b && { minX: b.minX - 0.15, maxX: b.maxX + 0.15, minY: b.minY - 0.15, maxY: b.maxY + 0.15 };
  }, [ground, tower]);
  // Patios, paths and ponds get a clearing in the grass.
  const clearings = useMemo(() => {
    const list = project.outdoor.flatMap((i): [number, number, number][] => {
      const d = catalogItem(i.catalogId);
      // Only for big flat things: flowers and tufts sit in the grass rather than replacing it.
      return d?.flat && Math.max(d.size.w, d.size.d) >= 1.5 ? [[i.at.x, i.at.y, Math.hypot(d.size.w, d.size.d) / 2]] : [];
    });
    return list.length ? list : NO_HOLES;
  }, [project.outdoor]);
  const [cutaway, setCutaway] = useState(true);
  /** 0 is midday, 1 is night. */
  const [night, setNight] = useState(0);
  const planCentre = useMemo(() => ({ x: bounds.centre[0], y: bounds.centre[2] }), [bounds]);
  const isEmpty = floors.every((f) => f.walls.length === 0);
  const sky = useMemo(() => new THREE.Color(DAY_SKY[mode]).lerp(new THREE.Color(NIGHT_SKY), night), [mode, night]);
  const decorating = mode === 'interior' && !compact && !walking;
  // The slider moves the sun from high in the sky down to below the horizon.
  const sunAngle = ((52 - 66 * night) * Math.PI) / 180;
  const daylight = Math.max(0, Math.sin(sunAngle));
  const sunDirection = useMemo<[number, number, number]>(
    () => [Math.cos(sunAngle) * 0.8, Math.sin(sunAngle), Math.cos(sunAngle) * 0.6],
    [sunAngle],
  );
  const selectedItemId = selection?.kind === 'item' ? selection.id : null;
  const lite = useStore((s) => s.lite);
  const house = useRef<THREE.Group>(null);
  const [busy, setBusy] = useState('');

  // Ray tracing: a slower, far more lifelike way of drawing the view.
  const [rayTraced, setRayTraced] = useState(false);
  const [sunBeams, setSunBeams] = useState(false);
  const [passes, setPasses] = useState(0);
  const tracing = rayTraced && !compact;
  useEffect(() => {
    setReflective(tracing);
    return () => setReflective(false);
  }, [tracing]);
  // Slightly hazy air inside the house, so shafts of sunlight show up. Kept just inside the outer walls.
  const haze = useMemo(() => {
    if (!sunBeams) return null;
    const rects = floors.flatMap((f) => wallBounds(f) ?? []);
    if (!rects.length) return null;
    const [minX, maxX] = [Math.min(...rects.map((r) => r.minX)) + 0.05, Math.max(...rects.map((r) => r.maxX)) - 0.05];
    const [minZ, maxZ] = [Math.min(...rects.map((r) => r.minY)) + 0.05, Math.max(...rects.map((r) => r.maxY)) - 0.05];
    const bottom = Math.min(...floors.map((f) => f.elevation)) + 0.02;
    const top = Math.max(...floors.map((f) => f.elevation + f.wallHeight)) - 0.02;
    return {
      centre: [(minX + maxX) / 2, (bottom + top) / 2, (minZ + maxZ) / 2] as [number, number, number],
      size: [maxX - minX, top - bottom, maxZ - minZ] as [number, number, number],
    };
  }, [sunBeams, floors]);
  const watch = useMemo(() => [project, walking, mode, active.id], [project, walking, mode, active.id]);
  // If the graphics card stops responding (more likely while ray tracing on a built-in laptop chip),
  // the browser resets it. Switch ray tracing off and say so, rather than leaving a blank view.
  const onContextLost = (e: Event) => {
    e.preventDefault(); // lets the browser give the view back once the card has recovered
    if (rayTracedRef.current) {
      setRayTraced(false);
      setBusy('Ray tracing was switched off because the graphics card stopped responding. Try it with Lighter graphics.');
    }
  };
  const rayTracedRef = useRef(rayTraced);
  rayTracedRef.current = rayTraced;

  /** Saves a picture of the view, without the selection outline or the piece being placed. */
  const takePhoto = () => {
    const st = useStore.getState();
    st.select(null);
    st.setPlacing(null);
    // A ray-traced photo waits until the picture has cleared up, which can take a while on a slow graphics card.
    if (tracing) setBusy('Rendering the photo… keep the view still');
    // Give the view a moment to redraw without them (and to show the message above).
    setTimeout(async () => {
      const url = await sceneApi.photo?.();
      if (url) saveFile(`${fileStem(project)} ${mode}${tracing ? ' ray traced' : ''}.png`, url);
      setBusy('');
    }, 120);
  };
  const exportModel = async () => {
    useStore.getState().select(null);
    setBusy('Preparing the 3D model…');
    try {
      await new Promise((resolve) => setTimeout(resolve, 80));
      const data = await sceneApi.model?.();
      if (data) saveFile(`${fileStem(project)}.glb`, new Blob([data], { type: 'model/gltf-binary' }));
      setBusy('');
    } catch (err) {
      console.error('Could not export the 3D model', err);
      setBusy('The 3D model could not be exported.');
    }
  };

  // Walking starts in the middle of the biggest room. Worked out once, on entering walk mode.
  const walkStart = useMemo<Vec2>(() => {
    const rooms = detectRooms(active.walls);
    if (!rooms.length) return planCentre;
    return rooms.reduce((a, b) => (b.area > a.area ? b : a)).centroid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking, active.id]);

  return (
    <div className={`scene${placing && (decorating || outdoors) ? ' placing' : ''}`}>
      {/* Indoors nothing moves on its own, so the view is only redrawn when something changes. */}
      <Canvas shadows camera={{ fov: 45, near: 0.1, far: city ? 9000 : 3000 }} dpr={lite ? 1 : [1, 1.5]}
        onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', onContextLost)}
        frameloop={outdoors || walking || tracing ? 'always' : 'demand'}>
        {/*
          If the computer cannot keep up, switch to lighter graphics and stay there. Only measured while the
          view is animating and on screen: an idle view, or a tab in the background, draws few frames by design.
          Not measured while ray tracing, which is slow on purpose.
        */}
        {(outdoors || walking) && !tracing && (
          <PerformanceMonitor onDecline={() => !document.hidden && useStore.getState().setLite(true)} />
        )}
        <SceneApi house={house} />
        <ModelWatcher />
        {tracing && (
          <RayTracer watch={watch} night={night} paused={!!placing} quality={lite ? 0.5 : 0.75} haze={haze} onProgress={setPasses} />
        )}
        {/* While ray tracing, the tracer supplies its own sky, which also lights the scene. */}
        {!tracing && <color attach="background" args={[sky]} />}
        {city ? (
          <fog attach="fog" args={[sky, 900, 5200]} />
        ) : (
          outdoors && <fog attach="fog" args={[sky, Math.max(140, bounds.radius * 4), 1100 + bounds.radius * 4]} />
        )}
        {(outdoors || city) && !tracing && (
          <Sky distance={city ? 7000 : 2500} sunPosition={sunDirection} turbidity={4} rayleigh={1.1} mieCoefficient={0.004} mieDirectionalG={0.85} />
        )}
        <hemisphereLight args={['#ffffff', city ? '#8c8a86' : outdoors ? '#6f8f4e' : '#b9b4aa', 1.0 - 0.85 * night]} />
        <directionalLight
          // The sun follows the Day–Night slider indoors too, so a low evening sun streams in through the windows.
          position={[sunDirection[0] * shadow * 2, Math.max(0.05, sunDirection[1]) * shadow * 2, sunDirection[2] * shadow * 2]}
          intensity={outdoors || tracing ? 2.2 * daylight : 1.7 * (1 - night)}
          castShadow
          shadow-mapSize={outdoors && !lite ? [4096, 4096] : [2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
          shadow-camera-left={-shadow}
          shadow-camera-right={shadow}
          shadow-camera-top={shadow}
          shadow-camera-bottom={-shadow}
          shadow-camera-far={shadow * 4}
        />
        {/* The house and garden: this group is what the 3D model export saves. */}
        <group ref={house}>
          {outdoors && apartment ? (
            <Tower project={project} selectedItemId={selectedItemId} />
          ) : (
            floors.map((f) => (
              <FloorModel key={f.id} floor={f} below={floorAt(project, f.level - 1)} ceiling={mode === 'exterior' || walking}
                // Walls stay whole while ray tracing, so they cast their real shadows.
                cutaway={mode === 'interior' && cutaway && !walking && !tracing ? planCentre : null}
                selectedItemId={selectedItemId} siding={project.exterior.siding} />
            ))
          )}
          {outdoors && !apartment && <Roof floors={project.floors} style={project.exterior} />}
          {outdoors &&
            project.outdoor.map((item) => <ItemModel key={item.id} item={item} selected={item.id === selectedItemId} />)}
        </group>
        {outdoors && city ? (
          <>
            <City plan={city} night={night} />
            {lot.fence && <LotFence lot={lot} />}
          </>
        ) : outdoors ? (
          <>
            <Terrain lot={lot} />
            {/* The swaying blades are a visual effect the ray tracer cannot follow; the green ground remains. */}
            {!tracing && (
              <Grass house={houseArea} holes={clearings} light={0.15 + 0.85 * Math.min(1, daylight * 1.6)} sparse={lite} />
            )}
            <DistantTrees lot={lot} />
            {lot.fence && <LotFence lot={lot} />}
          </>
        ) : city ? (
          // From an apartment, the city lies below the windows and balcony, with the floors of the block underneath.
          <group position-y={-drop}>
            <City plan={city} night={night} />
            <Tower project={project} selectedItemId={null} upTo={project.building?.floor ?? 1} />
          </group>
        ) : (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position-y={active.elevation - 0.06} receiveShadow>
            <planeGeometry args={[400, 400]} />
            <meshStandardMaterial color="#dfe3e8" />
          </mesh>
        )}
        {walking ? (
          <WalkControls floor={active} start={walkStart} />
        ) : (
          <CameraRig frameKey={`${mode}:${loads}:${mode === 'interior' ? active.id : ''}:${landmark.n}`} bounds={bounds}
            steep={mode === 'interior'}
            // Outside an apartment, look across the block toward the Empire State Building and the harbour.
            far={city ? 3000 : 250} shot={cityShot} glide={landmark.n > 0} />
        )}
        {decorating && <Decorator floor={active} />}
        {outdoors && <Decorator floor={ground} outdoor={lotEdges} />}
      </Canvas>

      {!compact && mode === 'interior' && !walking && <FloorSwitcher />}
      {!isEmpty && (
        <div className="scene-tools">
          {city && outdoors && !compact && (
            <span className="landmarks" role="group" aria-label="Look at">
              Look at
              {(
                [
                  ['home', 'Your building'],
                  ['empire', 'Empire State Building'],
                  ['liberty', 'Statue of Liberty'],
                ] as const
              ).map(([which, label]) => (
                <button key={which} className={landmark.which === which ? 'active' : ''}
                  onClick={() => setLandmark((l) => ({ which, n: l.n + 1 }))}>
                  {label}
                </button>
              ))}
            </span>
          )}
          {mode === 'interior' && !walking && !tracing && (
            <label className="check" title="Lower the walls between you and the rooms so you can see inside">
              <input type="checkbox" checked={cutaway} onChange={() => setCutaway((v) => !v)} />
              Cut away near walls
            </label>
          )}
          {mode === 'interior' && !compact && (
            <button onClick={() => useStore.getState().setWalk(!walking)}>
              {walking ? 'Leave walk-through (Esc)' : 'Walk through'}
            </button>
          )}
          {!compact && (
            <label className="check">
              Day
              <input type="range" min="0" max="1" step="0.05" value={night} aria-label="Time of day"
                onChange={(e) => setNight(Number(e.target.value))} />
              Night
            </label>
          )}
          {!compact && <button title="Save a picture of this view" onClick={takePhoto}>Photo</button>}
          {!compact && outdoors && (
            <button title="Save the house and garden as a 3D model file (.glb) for other 3D programs"
              onClick={() => void exportModel()}>
              Export 3D model
            </button>
          )}
          {!compact && (
            <label className="check"
              title="Follow light as it really travels: sunlight through windows, lamp light, true shadows and reflections. The picture starts grainy and clears up over a few seconds.">
              <input type="checkbox" checked={rayTraced} onChange={() => setRayTraced((v) => !v)} />
              Ray tracing
            </label>
          )}
          {tracing && (
            <label className="check" title="Slightly hazy air indoors, so shafts of sunlight through the windows become visible. Takes longer to clear up.">
              <input type="checkbox" checked={sunBeams} onChange={() => setSunBeams((v) => !v)} />
              Sun beams
            </label>
          )}
          {tracing && (
            <span role="status" className="passes">
              {placing
                ? 'Paused while placing'
                : passes === 0
                  ? 'Preparing… (up to a minute the first time)'
                  : passes >= 250
                    ? 'Finished'
                    : `Refining, pass ${passes}`}
            </span>
          )}
          {!compact && (
            <label className="check" title="Less grass, softer shadows and lower sharpness, for slower computers. Turns on by itself if the view is struggling.">
              <input type="checkbox" checked={lite} onChange={() => useStore.getState().setLite(!lite)} />
              Lighter graphics
            </label>
          )}
          {busy && <span role="status">{busy}</span>}
        </div>
      )}
      {isEmpty ? (
        <div className="scene-note">
          <strong>Nothing to show yet</strong>
          <span>Draw some walls in the Plan tab and they will appear here in 3D.</span>
        </div>
      ) : (
        !compact && (
          <div className="status">
            <span>
              {walking
                ? 'Walking through. W A S D or arrow keys to move · drag to look around · Esc to leave.'
                : placing && outdoors
                  ? 'Click on the lot to place it · T to turn · hold Shift to place several · Esc to cancel.'
                  : placing && decorating
                    ? 'Click in the room to place it · T to turn · hold Shift to place several · Alt to place freely · Esc to cancel.'
                    : mode === 'interior'
                      ? 'Drag to look around · scroll to zoom · click furniture to select and drag it · click a floor to restyle the room.'
                      : 'Drag to look around · scroll to zoom · right-drag to move · click something in the garden to select and drag it.'}
            </span>
          </div>
        )
      )}
    </div>
  );
}
