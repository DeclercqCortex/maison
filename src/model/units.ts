import type { Units } from './types';

export const FT = 0.3048;
export const INCH = 0.0254;

export function formatLength(m: number, units: Units): string {
  if (units === 'metric') return `${m.toFixed(2)} m`;
  const inches = Math.round(m / INCH);
  return `${Math.floor(inches / 12)}' ${inches % 12}"`;
}

export function formatArea(m2: number, units: Units): string {
  return units === 'metric' ? `${m2.toFixed(1)} m²` : `${Math.round(m2 * 10.7639)} sq ft`;
}

/**
 * Reads a typed length and returns metres, or null if it is not a valid length.
 * Metric: "4.2", "4.2m", "420cm", "4200mm". Imperial: "12", "12'", "12'6", "12' 6\"", "6\"".
 */
export function parseLength(text: string, units: Units): number | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  let metres: number | null = null;
  if (units === 'metric') {
    const m = /^(\d*\.?\d+)\s*(m|cm|mm)?$/.exec(s);
    if (m) metres = Number(m[1]) * (m[2] === 'cm' ? 0.01 : m[2] === 'mm' ? 0.001 : 1);
  } else {
    const inchesOnly = /^(\d*\.?\d+)\s*(?:"|in)$/.exec(s);
    const feet = /^(\d*\.?\d+)\s*(?:'|ft)?\s*(?:(\d*\.?\d+)\s*(?:"|in)?)?$/.exec(s);
    if (inchesOnly) metres = Number(inchesOnly[1]) * INCH;
    else if (feet) metres = Number(feet[1]) * FT + (feet[2] ? Number(feet[2]) * INCH : 0);
  }
  return metres !== null && Number.isFinite(metres) && metres > 0 ? metres : null;
}

/** Grid line spacing (minor, major) in metres for a zoom level in pixels per metre. */
export function gridSteps(zoom: number, units: Units): { minor: number; major: number } {
  const u = units === 'metric' ? 1 : FT;
  const pairs: [number, number][] =
    units === 'metric'
      ? [[0.1, 1], [0.5, 1], [1, 5], [5, 25], [10, 50]]
      : [[1 / 12, 1], [0.5, 1], [1, 5], [5, 25], [10, 50]];
  const pick = pairs.find(([minor]) => minor * u * zoom >= 6) ?? pairs[pairs.length - 1];
  return { minor: pick[0] * u, major: pick[1] * u };
}

/** Distance the cursor snaps to, in metres. */
export function snapStep(zoom: number, units: Units): number {
  if (units === 'metric') return zoom >= 30 ? 0.1 : zoom >= 8 ? 0.5 : 1;
  return zoom >= 30 ? FT / 2 : zoom >= 8 ? FT : 5 * FT;
}
