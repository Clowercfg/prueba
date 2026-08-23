import { POND, PLOTS, distanceToPaths, terrainHeight, terrainNormal } from './terrainMath'
import { makeRng } from './math'
import { isNearObstacle } from '../config/buildingsLayout'
import { insideAnyEnclosure } from '../config/enclosuresConfig'

/**
 * Colisionadores de árboles para la IA de animales.
 *
 * Extracción de `entities/vegetation/vegetationData.ts` del proyecto anterior:
 * solo la parte de árboles, única usada por el sistema de esquiva de la IA.
 * Como en el original los árboles son LO PRIMERO que consume el rng
 * (makeRng(20260214)), esta extracción reproduce posiciones idénticas a las
 * del proyecto anterior sin generar pasto/flores/rocas (que la IA no usa).
 */

export interface VegetationInstance {
  x: number;
  z: number;
  y: number;
  scale: number;
  yaw: number;
  phase: number;
}

function scatter(
  rng: () => number,
  farmMax: number,
  outerMax: number,
  farmCount: number,
  outerCount: number,
  minSpacing: number,
  onTreeOnly: boolean
): VegetationInstance[] {
  const placed: Array<[number, number]> = [];
  const out: VegetationInstance[] = [];
  const attempts = (farmCount + outerCount) * 40;

  for (let n = 0; n < attempts && out.length < farmCount + outerCount; n++) {
    const r = Math.sqrt(rng()) * outerMax;
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    if (r > farmMax && out.length >= farmCount) continue;
    if (r > outerMax) continue;

    if (distanceToPaths(x, z) < 3.4) continue;
    if (POND) {
      if (Math.hypot(x - POND.x, z - POND.z) < POND.radius + 4) continue;
    }
    if (insideAnyEnclosure(x, z, 1.5)) continue;
    if (PLOTS.some((p) => Math.abs(x - p.cx) < p.w / 2 + 1.5 && Math.abs(z - p.cz) < p.d / 2 + 1.5)) continue;
    if (isNearObstacle(x, z, 1.5)) continue;
    const nrm = terrainNormal(x, z, 1.5);
    if (nrm.y < 0.5) continue;
    if (onTreeOnly) {
      let ok = true;
      for (const [px, pz] of placed) {
        if (Math.hypot(x - px, z - pz) < minSpacing) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      placed.push([x, z]);
    }
    const isOuter = r > farmMax;
    out.push({
      x,
      z,
      y: terrainHeight(x, z),
      scale: isOuter ? 0.7 + rng() * 0.6 : 0.9 + rng() * 0.9,
      yaw: rng() * Math.PI * 2,
      phase: rng(),
    });
  }
  return out;
}

let cachedTrees: VegetationInstance[] | null = null;

export function getTreeColliders(): Array<{ x: number; z: number; radius: number }> {
  if (!cachedTrees) cachedTrees = scatter(makeRng(20260214), 100, 260, 95, 130, 6.5, true);
  return cachedTrees.map((t) => ({ x: t.x, z: t.z, radius: 0.5 * t.scale }));
}
