import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { canStand } from '../model/placement3d';
import type { Floor, Vec2 } from '../model/types';
import { useStore } from '../store/store';

const EYE_HEIGHT = 1.6;
const SPEED = 2.4; // metres per second
const KEYS: Record<string, [number, number]> = {
  w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0],
};

/**
 * First-person walk-through: W A S D or the arrow keys to move, drag to look
 * around, Esc to leave. Walls stop you; doorways and archways let you through.
 */
export function WalkControls({ floor, start }: { floor: Floor; start: Vec2 }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const look = useRef({ yaw: 0, pitch: -0.05 });
  const held = useRef(new Set<string>());
  const latest = useRef(floor);
  latest.current = floor;

  useEffect(() => {
    const before = camera.fov;
    camera.fov = 70;
    camera.updateProjectionMatrix();
    camera.rotation.order = 'YXZ';
    camera.position.set(start.x, latest.current.elevation + EYE_HEIGHT, start.y);

    const el = gl.domElement;
    let dragging = false;
    const down = (e: PointerEvent) => {
      dragging = true;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      look.current.yaw -= e.movementX * 0.004;
      look.current.pitch = Math.max(-1.3, Math.min(1.3, look.current.pitch - e.movementY * 0.004));
    };
    const up = () => (dragging = false);
    const keyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'escape') useStore.getState().setWalk(false);
      if (KEYS[key] && !(e.target as HTMLElement).matches?.('input, select, textarea')) {
        held.current.add(key);
        e.preventDefault();
      }
    };
    const keyUp = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase());
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      camera.fov = before;
      camera.updateProjectionMatrix();
      camera.rotation.order = 'XYZ';
    };
    // Runs once on entering walk mode; the start point is only where you begin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  useFrame((_, dt) => {
    const { yaw, pitch } = look.current;
    let strafe = 0;
    let forward = 0;
    for (const key of held.current) {
      strafe += KEYS[key][0];
      forward += KEYS[key][1];
    }
    if (strafe || forward) {
      const len = Math.hypot(strafe, forward);
      const stepLength = (SPEED * Math.min(dt, 0.1)) / len;
      // On the plan: forward is where the camera looks, strafe is to its right.
      const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * stepLength;
      const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * stepLength;
      const { walls, openings } = latest.current;
      const ok = (x: number, z: number) => canStand({ x, y: z }, walls, openings);
      const { x, z } = camera.position;
      // Try the full step, then slide along whichever direction is free.
      if (ok(x + dx, z + dz)) camera.position.set(x + dx, camera.position.y, z + dz);
      else if (ok(x + dx, z)) camera.position.x = x + dx;
      else if (ok(x, z + dz)) camera.position.z = z + dz;
    }
    camera.rotation.set(pitch, yaw, 0);
  });
  return null;
}
