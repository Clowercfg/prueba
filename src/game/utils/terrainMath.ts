import { ENCLOSURES } from "../config/enclosuresConfig";
import { fbm } from "./noise";
import { smoothstep } from "./math";

/**
 * Altura de terreno para el world space único (tiles 0..28). Función pura y
 * determinista: aplana suavemente los interiores de los corrales reales
 * (ENCLOSURES) y devuelve colinas suaves fuera de ellos. La componente Y de
 * animal.position la consume solo lógica interna, nunca el render iso.
 */

interface PlotRect {
  cx: number;
  cz: number;
  w: number;
  d: number;
}

const FLAT_RECTS: PlotRect[] = ENCLOSURES.map((e) => {
  const b = e.bounds;
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX, d: b.maxZ - b.minZ };
});

function baseHeight(x: number, z: number): number {
  const noise = fbm(x * 0.006 + 13.7, z * 0.006 - 2.3, 4);
  return 1.9 + noise * 0.5;
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

export function pointInRect(x: number, z: number, r: PlotRect, feather: number): number {
  const dx = Math.abs(x - r.cx) - r.w / 2;
  const dz = Math.abs(z - r.cz) - r.d / 2;
  const d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  const inside = Math.max(dx, dz) <= 0;
  return inside ? 1 : 1 - smoothstep(0, feather, d);
}
