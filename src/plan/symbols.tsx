import type { Feature, Opening, Vec2, Wall } from '../model/types';
import { dist, lerp, sub } from '../model/geometry';
import { lRun, SPIRAL_START, SPIRAL_SWEEP, spiralDims, U_GAP, uDims } from '../model/stairs';

type OpeningShape = Pick<Opening, 'type' | 'offset' | 'width' | 'side' | 'hingeAtB'> & { id?: string };

/**
 * Plan symbol for a door, window or archway, drawn in the wall's own frame:
 * x runs along the wall and y points to the wall's `side: 1` face.
 */
export function OpeningSymbol(props: {
  opening: OpeningShape;
  wall: Wall;
  /** Extra class: 'selected', 'preview' or 'invalid'. */
  state?: string;
  /** Minimum half-height of the click target, in metres. Omit for non-interactive symbols. */
  hitPad?: number;
}) {
  const { opening: o, wall } = props;
  const len = dist(wall.a, wall.b);
  if (len < 1e-6) return null;
  const d = sub(wall.b, wall.a);
  const c = lerp(wall.a, wall.b, o.offset / len);
  const w = Math.min(o.width, len);
  const t = wall.thickness;
  const hx = o.hingeAtB ? w / 2 : -w / 2;
  const sweep = (o.hingeAtB ? 1 : 0) ^ (o.side === -1 ? 1 : 0);
  return (
    <g
      className={`opening ${o.type} ${props.state ?? ''}`}
      transform={`translate(${c.x} ${c.y}) rotate(${(Math.atan2(d.y, d.x) * 180) / Math.PI})`}
    >
      <rect className="gap" x={-w / 2} y={-t / 2 - 0.01} width={w} height={t + 0.02} />
      {o.type === 'door' && (
        <>
          <path className="swing" d={`M ${hx} ${o.side * w} A ${w} ${w} 0 0 ${sweep} ${-hx} 0`} />
          <line className="leaf" x1={hx} y1={0} x2={hx} y2={o.side * w} />
        </>
      )}
      {o.type === 'window' && (
        <>
          <rect className="frame" x={-w / 2} y={-t / 2} width={w} height={t} />
          <line className="glass" x1={-w / 2} y1={0} x2={w / 2} y2={0} />
        </>
      )}
      {o.type === 'archway' && (
        <>
          <line className="edge" x1={-w / 2} y1={-t / 2} x2={w / 2} y2={-t / 2} />
          <line className="edge" x1={-w / 2} y1={t / 2} x2={w / 2} y2={t / 2} />
        </>
      )}
      {props.hitPad !== undefined && o.id && (
        <rect
          className="opening-hit"
          data-opening={o.id}
          x={-w / 2}
          y={-Math.max(t / 2, props.hitPad)}
          width={w}
          height={2 * Math.max(t / 2, props.hitPad)}
        />
      )}
    </g>
  );
}

const TREAD = 0.27;

/** Evenly spaced positions from `from` to `to`, about one stair tread apart, including `from`. */
function steps(from: number, to: number): number[] {
  const n = Math.max(2, Math.round(Math.abs(to - from) / TREAD));
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / n);
}

/** Outline, tread lines and direction-of-travel line for a staircase, centred on the origin. */
function stairParts(f: Pick<Feature, 'width' | 'depth' | 'shape'>): { outline: string; treads: string; arrow: Vec2[] } {
  const w = f.width;
  const d = f.depth;
  const [l, r, top, bottom] = [-w / 2, w / 2, -d / 2, d / 2];
  const rect = `M ${l} ${top} H ${r} V ${bottom} H ${l} Z`;
  const across = (y: number, x1: number, x2: number) => `M ${x1} ${y} H ${x2}`;
  const down = (x: number, y1: number, y2: number) => `M ${x} ${y1} V ${y2}`;

  if (f.shape === 'L') {
    // Up the left side, turn on a corner landing, then along the top to the right.
    const run = lRun(w, d);
    return {
      outline: `M ${l} ${bottom} V ${top} H ${r} V ${top + run} H ${l + run} V ${bottom} Z`,
      treads: [
        ...steps(top + run, bottom).map((y) => across(y, l, l + run)),
        ...steps(l + run, r).map((x) => down(x, top, top + run)),
      ].join(' '),
      arrow: [
        { x: l + run / 2, y: bottom - 0.15 },
        { x: l + run / 2, y: top + run / 2 },
        { x: r - 0.15, y: top + run / 2 },
      ],
    };
  }
  if (f.shape === 'U') {
    // Up the left side, across a full-width landing, back down the page on the right.
    const gap = U_GAP;
    const { run, landing } = uDims(w, d);
    const ys = steps(top + landing, bottom);
    return {
      outline: rect,
      treads: [
        ...ys.map((y) => across(y, l, -gap / 2)),
        ...ys.map((y) => across(y, gap / 2, r)),
        down(-gap / 2, top + landing, bottom),
        down(gap / 2, top + landing, bottom),
      ].join(' '),
      arrow: [
        { x: l + run / 2, y: bottom - 0.15 },
        { x: l + run / 2, y: top + landing / 2 },
        { x: r - run / 2, y: top + landing / 2 },
        { x: r - run / 2, y: bottom - 0.15 },
      ],
    };
  }
  if (f.shape === 'spiral') {
    const { radius, post } = spiralDims(w, d);
    const polar = (deg: number, rad: number): Vec2 => ({
      x: Math.cos((deg * Math.PI) / 180) * rad,
      y: Math.sin((deg * Math.PI) / 180) * rad,
    });
    const angles = Array.from({ length: SPIRAL_SWEEP / 30 + 1 }, (_, i) => SPIRAL_START + i * 30);
    return {
      outline: `M ${radius} 0 A ${radius} ${radius} 0 1 0 ${-radius} 0 A ${radius} ${radius} 0 1 0 ${radius} 0 Z`,
      treads: angles
        .map((a) => {
          const p = polar(a, post);
          const q = polar(a, radius);
          return `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
        })
        .join(' '),
      arrow: Array.from({ length: 19 }, (_, i) => polar(105 + i * 15, radius * 0.62)),
    };
  }
  return {
    outline: rect,
    treads: steps(top, bottom).slice(1).map((y) => across(y, l, r)).join(' '),
    arrow: [
      { x: 0, y: bottom - 0.15 },
      { x: 0, y: top + 0.15 },
    ],
  };
}

function arrowHead(points: Vec2[]): string {
  const tip = points[points.length - 1];
  const prev = points[points.length - 2];
  const len = dist(tip, prev) || 1;
  const u = { x: (tip.x - prev.x) / len, y: (tip.y - prev.y) / len };
  const size = 0.14;
  const base = { x: tip.x - u.x * size, y: tip.y - u.y * size };
  return `${tip.x},${tip.y} ${base.x - u.y * size * 0.5},${base.y + u.x * size * 0.5} ${base.x + u.y * size * 0.5},${base.y - u.x * size * 0.5}`;
}

type FeatureShape = Pick<Feature, 'type' | 'at' | 'rotation' | 'width' | 'depth' | 'shape'> & { id?: string };

/** Plan symbol for stairs, a fireplace or a column. The fireplace opens toward local +y. */
export function FeatureSymbol(props: {
  feature: FeatureShape;
  /** Extra class: 'selected', 'preview' or 'stairwell' (the hole seen from the floor above). */
  state?: string;
  interactive?: boolean;
}) {
  const f = props.feature;
  const w = f.width;
  const d = f.depth;
  let body;
  if (f.type === 'column') {
    body = <rect className="solid" x={-w / 2} y={-d / 2} width={w} height={d} />;
  } else if (f.type === 'fireplace') {
    const jamb = Math.min(0.2, w * 0.15);
    const splay = Math.min(0.1, w * 0.08);
    const back = Math.min(0.15, d * 0.3);
    body = (
      <path
        className="solid"
        fillRule="evenodd"
        d={`M ${-w / 2} ${-d / 2} H ${w / 2} V ${d / 2} H ${-w / 2} Z M ${-w / 2 + jamb} ${d / 2} L ${-w / 2 + jamb + splay} ${-d / 2 + back} H ${w / 2 - jamb - splay} L ${w / 2 - jamb} ${d / 2} Z`}
      />
    );
  } else {
    const parts = stairParts(f);
    body = (
      <>
        <path className="outline" d={parts.outline} />
        <path className="treads" d={parts.treads} />
        <polyline className="arrow" points={parts.arrow.map((p) => `${p.x},${p.y}`).join(' ')} />
        <polygon className="arrow-head" points={arrowHead(parts.arrow)} />
      </>
    );
  }
  return (
    <g className={`feature ${f.type} ${props.state ?? ''}`} transform={`translate(${f.at.x} ${f.at.y}) rotate(${f.rotation})`}>
      {body}
      {props.interactive && f.id && (
        <rect className="feature-hit" data-feature={f.id} x={-w / 2} y={-d / 2} width={w} height={d} />
      )}
    </g>
  );
}
