import type { Feature, Vec2 } from './types';

/**
 * Staircase layout shared by the 2D symbol and the 3D model. Everything is in
 * the stair's own frame: centred on the origin, x across, y down the page.
 * Stairs start at the bottom edge (+y) and climb toward the top edge (-y).
 */
type StairSize = Pick<Feature, 'width' | 'depth' | 'shape'>;

/** Width of each flight of an L-shaped stair. */
export const lRun = (w: number, d: number): number => Math.min(0.9, w / 2, d / 2);

export const U_GAP = 0.1;
/** Flight width and landing depth of a U-shaped stair. */
export function uDims(w: number, d: number): { run: number; landing: number } {
  const run = (w - U_GAP) / 2;
  return { run, landing: Math.min(run, d / 3) };
}

export const SPIRAL_START = 90;
export const SPIRAL_SWEEP = 300;
export function spiralDims(w: number, d: number): { radius: number; post: number } {
  const radius = Math.min(w, d) / 2;
  return { radius, post: Math.min(0.12, radius / 3) };
}

/** The floor area the stair covers, as a polygon. Also the hole it needs in the floor above. */
export function stairOutline(f: StairSize): Vec2[] {
  const [l, r, top, bottom] = [-f.width / 2, f.width / 2, -f.depth / 2, f.depth / 2];
  if (f.shape === 'L') {
    const run = lRun(f.width, f.depth);
    return [
      { x: l, y: bottom }, { x: l, y: top }, { x: r, y: top },
      { x: r, y: top + run }, { x: l + run, y: top + run }, { x: l + run, y: bottom },
    ];
  }
  if (f.shape === 'spiral') {
    const { radius } = spiralDims(f.width, f.depth);
    return Array.from({ length: 24 }, (_, i) => ({
      x: Math.cos((i / 24) * 2 * Math.PI) * radius,
      y: Math.sin((i / 24) * 2 * Math.PI) * radius,
    }));
  }
  return [{ x: l, y: top }, { x: r, y: top }, { x: r, y: bottom }, { x: l, y: bottom }];
}

/** Moves a point from the stair's own frame onto the plan. */
export function featureToPlan(f: Pick<Feature, 'at' | 'rotation'>, p: Vec2): Vec2 {
  const a = (f.rotation * Math.PI) / 180;
  return {
    x: f.at.x + p.x * Math.cos(a) - p.y * Math.sin(a),
    y: f.at.y + p.x * Math.sin(a) + p.y * Math.cos(a),
  };
}

/** One solid piece of a staircase: a step, a landing or a post. */
export interface StepBox {
  /** Centre, in the stair's own frame. */
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
  bottom: number;
  top: number;
  /** Degrees the box is turned about its own centre (spiral steps). */
  angle: number;
}

type Flight =
  | { kind: 'run'; from: Vec2; to: Vec2; width: number }
  | { kind: 'landing'; x: number; y: number; sizeX: number; sizeY: number };

function flights(f: StairSize): Flight[] {
  const [l, r, top, bottom] = [-f.width / 2, f.width / 2, -f.depth / 2, f.depth / 2];
  if (f.shape === 'L') {
    const run = lRun(f.width, f.depth);
    return [
      { kind: 'run', from: { x: l + run / 2, y: bottom }, to: { x: l + run / 2, y: top + run }, width: run },
      { kind: 'landing', x: l + run / 2, y: top + run / 2, sizeX: run, sizeY: run },
      { kind: 'run', from: { x: l + run, y: top + run / 2 }, to: { x: r, y: top + run / 2 }, width: run },
    ];
  }
  if (f.shape === 'U') {
    const { run, landing } = uDims(f.width, f.depth);
    return [
      { kind: 'run', from: { x: l + run / 2, y: bottom }, to: { x: l + run / 2, y: top + landing }, width: run },
      { kind: 'landing', x: 0, y: top + landing / 2, sizeX: f.width, sizeY: landing },
      { kind: 'run', from: { x: r - run / 2, y: top + landing }, to: { x: r - run / 2, y: bottom }, width: run },
    ];
  }
  return [{ kind: 'run', from: { x: 0, y: bottom }, to: { x: 0, y: top }, width: f.width }];
}

const RISER = 0.18;

/**
 * The solid pieces that make up a staircase climbing `rise` metres. The last
 * riser is the step onto the upper floor, so the top piece sits one riser below it.
 */
export function stairBoxes(f: StairSize, rise: number): StepBox[] {
  const risers = Math.max(2, Math.round(rise / RISER));
  const riser = rise / risers;

  if (f.shape === 'spiral') {
    const { radius, post } = spiralDims(f.width, f.depth);
    const n = risers - 1;
    const mid = (post + radius) / 2;
    const chord = 2 * radius * Math.sin(((SPIRAL_SWEEP / n) * Math.PI) / 360);
    const boxes: StepBox[] = [{ x: 0, y: 0, sizeX: post * 2, sizeY: post * 2, bottom: 0, top: rise + 0.9, angle: 0 }];
    for (let i = 0; i < n; i++) {
      const angle = SPIRAL_START + (SPIRAL_SWEEP * (i + 0.5)) / n;
      const rad = (angle * Math.PI) / 180;
      const top = (i + 1) * riser;
      boxes.push({
        x: Math.cos(rad) * mid, y: Math.sin(rad) * mid, sizeX: radius - post, sizeY: chord, bottom: top - 0.06, top, angle,
      });
    }
    return boxes;
  }

  const parts = flights(f);
  const runs = parts.filter((p) => p.kind === 'run');
  const lengths = runs.map((p) => Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y));
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  let stepsLeft = Math.max(runs.length, risers - 1 - (parts.length - runs.length));
  let lengthLeft = totalLength;

  const boxes: StepBox[] = [];
  let level = 0;
  let runIndex = 0;
  for (const part of parts) {
    if (part.kind === 'landing') {
      level++;
      boxes.push({ x: part.x, y: part.y, sizeX: part.sizeX, sizeY: part.sizeY, bottom: 0, top: level * riser, angle: 0 });
      continue;
    }
    const length = lengths[runIndex++];
    // Share the remaining steps out by length; the last flight takes whatever is left.
    const count = runIndex === runs.length ? stepsLeft : Math.max(1, Math.round((stepsLeft * length) / lengthLeft));
    stepsLeft -= count;
    lengthLeft -= length;
    const alongX = Math.abs(part.to.x - part.from.x) > Math.abs(part.to.y - part.from.y);
    for (let j = 0; j < count; j++) {
      const t = (j + 0.5) / count;
      level++;
      boxes.push({
        x: part.from.x + (part.to.x - part.from.x) * t,
        y: part.from.y + (part.to.y - part.from.y) * t,
        sizeX: alongX ? length / count : part.width,
        sizeY: alongX ? part.width : length / count,
        bottom: 0,
        top: level * riser,
        angle: 0,
      });
    }
  }
  return boxes;
}
