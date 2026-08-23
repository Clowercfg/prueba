import { WORLD } from "../config/worldConfig";
import { ENCLOSURES } from "../config/enclosuresConfig";
import { fbm } from "./noise";
import { lerp, smoothstep, clamp } from "./math";

export const POND = { x: 12, z: -24, radius: 11.5, depth: 2.2 };
export const WATER_Y = 1.0;

export interface PlotRect {
  cx: number;
  cz: number;
  w: number;
  d: number;
}

export const PLOTS: PlotRect[] = [
  { cx: -36, cz: 20, w: 21, d: 11 },
  { cx: -34, cz: 6, w: 15, d: 15 },
  { cx: -34, cz: -8, w: 15, d: 13 },
  { cx: -34, cz: -22, w: 15, d: 11 },
];

const FLAT_RECTS: PlotRect[] = [
  ...PLOTS,
  ...ENCLOSURES.map((e) => {
    const b = e.bounds;
    return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX, d: b.maxZ - b.minZ };
  }),
];

export interface PathPoint {
  x: number;
  z: number;
}

export const PATHS: PathPoint[][] = [
  [
    { x: 0, z: 0 },
    { x: -10, z: 14 },
    { x: -16, z: 20 },
  ],
  [
    { x: 0, z: 0 },
    { x: 0, z: 16 },
    { x: 2, z: 22 },
  ],
  [
    { x: 0, z: 0 },
    { x: -10, z: 4 },
    { x: -16, z: 4 },
  ],
  [
    { x: 0, z: 0 },
    { x: 2, z: 4 },
  ],
  [
    { x: 0, z: 0 },
    { x: -10, z: -4 },
    { x: -16, z: -8 },
  ],
  [
    { x: 0, z: 0 },
    { x: 4, z: -10 },
    { x: 6, z: -12 },
  ],
  [
    { x: 0, z: 0 },
    { x: 12, z: 4 },
    { x: 24, z: 12 },
    { x: 36, z: 20 },
    { x: 49, z: 26 },
  ],
  [
    { x: 0, z: 0 },
    { x: 30, z: 0 },
    { x: 62, z: 0 },
    { x: 95, z: 0 },
  ],
];

export const PATH_WIDTH = 2.6;

function baseHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const flat = 1 - smoothstep(WORLD.farmRadius, WORLD.farmRadius + 60, r);
  const noise = fbm(x * 0.006 + 13.7, z * 0.006 - 2.3, 4);
  const hills = fbm(x * 0.0016 + 91.2, z * 0.0016 + 7.7, 3);
  const local = 1.9 + noise * 0.5;
  const outside = 1.9 + noise * 3.0 + hills * 9.0;
  let h = lerp(outside, local, flat);
  const edge = smoothstep(WORLD.half - 160, WORLD.half, r);
  h = lerp(h, -2.5, edge);
  return h;
}

export function terrainHeight(x: number, z: number): number {
  let h = baseHeight(x, z);

  let flatMask = 0;
  let flatTarget = h;
  for (const r of FLAT_RECTS) {
    const m = pointInRect(x, z, r, 2.6);
    if (m > flatMask) {
      flatMask = m;
      flatTarget = baseHeight(r.cx, r.cz);
    }
  }
  h = h + (flatTarget - h) * flatMask;

  const pd = Math.hypot(x - POND.x, z - POND.z);
  const carve = 1 - smoothstep(POND.radius - POND.depth, POND.radius, pd);
  h -= POND.depth * carve;
  return h;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function terrainNormal(x: number, z: number, eps = 0.8): Vec3 {
  const hL = terrainHeight(x - eps, z);
  const hR = terrainHeight(x + eps, z);
  const hD = terrainHeight(x, z - eps);
  const hU = terrainHeight(x, z + eps);
  const dx = (hR - hL) / (2 * eps);
  const dz = (hU - hD) / (2 * eps);
  const len = Math.sqrt(dx * dx + 1 + dz * dz);
  return { x: -dx / len, y: 1 / len, z: -dz / len };
}

export function isInsideFarm(x: number, z: number, radius = WORLD.farmRadius): boolean {
  return Math.hypot(x, z) <= radius;
}

export function distanceToPaths(x: number, z: number): number {
  let best = Infinity;
  for (const chain of PATHS) {
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i];
      const b = chain[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
      const px = a.x + abx * t;
      const pz = a.z + abz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) best = d;
    }
  }
  return best;
}

export function plotAt(x: number, z: number): PlotRect | null {
  for (const p of PLOTS) {
    if (Math.abs(x - p.cx) < p.w / 2 && Math.abs(z - p.cz) < p.d / 2) return p;
  }
  return null;
}

export function pointInRect(x: number, z: number, r: PlotRect, feather: number): number {
  const dx = Math.abs(x - r.cx) - r.w / 2;
  const dz = Math.abs(z - r.cz) - r.d / 2;
  const d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  const inside = Math.max(dx, dz) <= 0;
  return inside ? 1 : 1 - smoothstep(0, feather, d);
}

export function heightArray(res = 256): Float32Array {
  const data = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const u = i / (res - 1);
      const v = j / (res - 1);
      const x = -WORLD.half + u * WORLD.size;
      const z = -WORLD.half + v * WORLD.size;
      data[j * res + i] = terrainHeight(x, z);
    }
  }
  return data;
}
