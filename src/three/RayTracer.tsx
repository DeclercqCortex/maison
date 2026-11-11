import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FogVolumeMaterial, GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';
import { onModelLoaded } from '../catalog/models';
import { sceneApi } from './SceneApi';

/** Stop refining after this many passes: by then the picture is clean, and the graphics card can rest. */
const MAX_SAMPLES = 250;
/** Passes a photo is refined to before it is saved. */
const PHOTO_SAMPLES = 96;

/**
 * Ray-traced rendering of whatever is in the 3D view.
 *
 * Instead of the usual quick approximation, light is followed as it really
 * travels: from the sun and lamps, through windows, bouncing off walls and
 * floors, and off mirrors and glossy tiles. That gives true shadows, light
 * spilling into rooms, and reflections. The picture starts grainy and clears
 * up over a few seconds, and starts again whenever the view or the house changes.
 *
 * While mounted this component draws the view itself, in place of the normal renderer.
 */
export function RayTracer(props: {
  /** The picture is rebuilt whenever any of these change (the house, the time of day, ...). */
  watch: unknown[];
  /** 0 is midday, 1 is night: sets the colour and brightness of the sky. */
  night: number;
  /** Show the ordinary quick view instead, while something is being placed or dragged. */
  paused: boolean;
  /** Fraction of full sharpness to trace at; lower is faster. */
  quality: number;
  /** A box of slightly hazy air, which makes beams of sunlight visible. Null for clear air. */
  haze: { centre: [number, number, number]; size: [number, number, number] } | null;
  /** Reports how many passes have been drawn so far. */
  onProgress(samples: number): void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const fog = useRef<THREE.Mesh>(null);
  const [loaded, setLoaded] = useState(0);

  const tracer = useMemo(() => {
    const t = new WebGLPathTracer(gl);
    t.filterGlossyFactor = 0.5;
    // Each pass is drawn in nine pieces, one per screen refresh. On a built-in laptop graphics chip a whole
    // pass can take seconds; drawing it in one go can stall the chip long enough for the browser to reset it.
    t.tiles.set(3, 3);
    t.minSamples = 2;
    t.renderDelay = 100;
    t.fadeDuration = 300;
    return t;
  }, [gl]);
  useEffect(() => () => tracer.dispose(), [tracer]);

  const hazeMaterial = useMemo(() => new FogVolumeMaterial({ color: '#ffffff', density: 0.035 }), []);
  useEffect(() => () => hazeMaterial.dispose(), [hazeMaterial]);

  /** The ordinary quick view, without the box of haze (which only makes sense when traced). */
  const quickView = useRef(() => {});
  quickView.current = () => {
    if (fog.current) fog.current.visible = false;
    gl.render(scene, camera);
    if (fog.current) fog.current.visible = true;
  };
  useEffect(() => {
    tracer.renderScale = props.quality;
    // Fewer bounces in lighter graphics: a little less light reaches deep corners, but each pass is quicker.
    tracer.bounces = props.quality < 0.6 ? 3 : 5;
    tracer.rasterizeSceneCallback = () => quickView.current();
  }, [tracer, props.quality]);

  // The sky: the tracer lights the scene from it, so it replaces the usual backdrop while tracing.
  const sky = useMemo(() => new GradientEquirectTexture(), []);
  useEffect(() => () => sky.dispose(), [sky]);
  useEffect(() => {
    sky.topColor.set('#4f86d9').lerp(new THREE.Color('#04060c'), props.night);
    sky.bottomColor.set('#e6eef7').lerp(new THREE.Color('#121825'), props.night);
    sky.update();
    scene.background = sky;
    scene.environment = sky;
    scene.environmentIntensity = 0.9 - 0.82 * props.night;
    return () => {
      scene.background = null;
      scene.environment = null;
      scene.environmentIntensity = 1;
    };
  }, [scene, sky, props.night]);

  useEffect(() => onModelLoaded(() => setLoaded((n) => n + 1)), []);

  // Hand the tracer a fresh copy of the scene shortly after it stops changing.
  const stale = useRef(true);
  useEffect(() => {
    stale.current = true;
    const timer = setTimeout(() => {
      scene.updateMatrixWorld(true);
      tracer.setScene(scene, camera);
      stale.current = false;
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracer, scene, camera, loaded, props.night, props.quality, !!props.haze, ...props.watch]);

  // Photos show the traced picture once it has cleared up, rather than capturing it mid-way while still grainy.
  // The picture keeps refining as normal; the photo is taken from the frame on which it is ready.
  const photoWaiters = useRef<((url: string) => void)[]>([]);
  useEffect(() => {
    const ordinary = sceneApi.photo;
    sceneApi.photo = () => new Promise<string>((resolve) => photoWaiters.current.push(resolve));
    return () => {
      sceneApi.photo = ordinary;
      // A photo still waiting when ray tracing is switched off is taken from the ordinary view instead.
      const waiting = photoWaiters.current.splice(0);
      if (waiting.length) {
        const url = ordinary?.();
        Promise.resolve(url).then((u) => waiting.forEach((resolve) => resolve(u ?? '')));
      }
    };
  }, []);

  const lastView = useRef(new THREE.Matrix4());
  const lastLens = useRef(new THREE.Matrix4());
  const lastSize = useRef(new THREE.Vector2());
  const drawingSize = useRef(new THREE.Vector2());
  const reported = useRef(-1);
  // A priority above zero tells the 3D view that this component does the drawing.
  useFrame(() => {
    if (props.paused || stale.current) {
      quickView.current();
      if (reported.current !== 0) props.onProgress((reported.current = 0));
      return;
    }
    // Start the picture again when the view changes size (side panels opening or closing): the tracer
    // clears its picture on a resize but would otherwise keep counting, leaving it nearly black.
    gl.getDrawingBufferSize(drawingSize.current);
    if (!drawingSize.current.equals(lastSize.current)) {
      lastSize.current.copy(drawingSize.current);
      tracer.reset();
    }
    // Start the picture again whenever the camera has moved.
    camera.updateMatrixWorld();
    if (!lastView.current.equals(camera.matrixWorld) || !lastLens.current.equals(camera.projectionMatrix)) {
      lastView.current.copy(camera.matrixWorld);
      lastLens.current.copy(camera.projectionMatrix);
      tracer.updateCamera();
    }
    const waiting = photoWaiters.current.length > 0;
    // Draw a pass while still refining, or whenever a photo needs the picture on the canvas.
    if (tracer.samples < MAX_SAMPLES || waiting) tracer.renderSample();
    // The canvas is only readable straight after drawing, so a waiting photo is taken right here.
    if (waiting && tracer.samples >= PHOTO_SAMPLES) {
      const url = gl.domElement.toDataURL('image/png');
      photoWaiters.current.splice(0).forEach((resolve) => resolve(url));
    }
    const samples = Math.floor(tracer.samples);
    if (samples !== reported.current) props.onProgress((reported.current = samples));
  }, 1);

  if (!props.haze) return null;
  return (
    <mesh ref={fog} position={props.haze.centre} material={hazeMaterial}>
      <boxGeometry args={props.haze.size} />
    </mesh>
  );
}
