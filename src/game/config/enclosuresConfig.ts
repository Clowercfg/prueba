import type { AnimalKind } from "../types/entities";

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface EnclosureDef {
  id: string;
  name: string;
  icon: string;
  kind: AnimalKind;
  bounds: Bounds;
  capacity: number;
  /** Posición de la puerta: arista del rectángulo y fracción (0..1) a lo largo de ella. */
  gate: { edge: "minX" | "maxX" | "minZ" | "maxZ"; t: number };
}

export const ENCLOSURES: EnclosureDef[] = [
  {
    id: "cow-pen",
    name: "Corral de vacas",
    icon: "🐄",
    kind: "cow",
    bounds: { minX: 36, maxX: 62, minZ: 26, maxZ: 48 },
    capacity: 12,
    gate: { edge: "minZ", t: 0.5 },
  },
  {
    id: "chicken-pen",
    name: "Corral de aves",
    icon: "🐔",
    kind: "chicken",
    bounds: { minX: 40, maxX: 56, minZ: -2, maxZ: 14 },
    capacity: 24,
    gate: { edge: "minZ", t: 0.4 },
  },
  {
    id: "pig-pen",
    name: "Pocilga",
    icon: "🐖",
    kind: "pig",
    bounds: { minX: 31, maxX: 55, minZ: -50, maxZ: -32 },
    capacity: 20,
    gate: { edge: "minX", t: 0.5 },
  },
];

export const ENCLOSURE_BY_KIND: Record<AnimalKind, EnclosureDef> = {
  cow: ENCLOSURES[0],
  chicken: ENCLOSURES[1],
  rooster: ENCLOSURES[1],
  pig: ENCLOSURES[2],
};

export function insideEnclosure(x: number, z: number): EnclosureDef | null {
  for (const e of ENCLOSURES) {
    if (x >= e.bounds.minX && x <= e.bounds.maxX && z >= e.bounds.minZ && z <= e.bounds.maxZ) return e;
  }
  return null;
}

export function insideAnyEnclosure(x: number, z: number, margin = 0): boolean {
  return ENCLOSURES.some(
    (e) =>
      x >= e.bounds.minX - margin &&
      x <= e.bounds.maxX + margin &&
      z >= e.bounds.minZ - margin &&
      z <= e.bounds.maxZ + margin
  );
}

export interface FenceSeg {
  x: number;
  z: number;
  rot: number;
}

/** Separación entre postes de la cerca real (cada tile Kenney mide 1.2). */
const FENCE_SPACING = 1.2;
/** Media anchura de la puerta: la cerca se pega justo a sus bordes sin dejar hueco. */
const GATE_HALF = 2;

function tileCenters(from: number, to: number, len: number): number[] {
  const span = to - from;
  if (span <= 0) return [];
  const n = Math.max(1, Math.ceil(span / len));
  const step = span / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(from + (i + 0.5) * step);
  return out;
}

/** Genera los segmentos de cerca del perímetro del corral, dejando hueco para la puerta. */
export function getEnclosureFences(def: EnclosureDef): FenceSeg[] {
  const b = def.bounds;
  const segs: FenceSeg[] = [];
  const len = FENCE_SPACING;

  const addEdge = (edge: "minX" | "maxX" | "minZ" | "maxZ", fixed: number, rot: number) => {
    const alongX = edge === "minZ" || edge === "maxZ";
    const lo = alongX ? b.minX : b.minZ;
    const hi = alongX ? b.maxX : b.maxZ;
    const ranges: Array<[number, number]> = [];
    if (def.gate.edge === edge) {
      const center = lo + def.gate.t * (hi - lo);
      ranges.push([lo, center - GATE_HALF], [center + GATE_HALF, hi]);
    } else {
      ranges.push([lo, hi]);
    }
    for (const [from, to] of ranges) {
      for (const c of tileCenters(from, to, len)) {
        if (alongX) segs.push({ x: c, z: fixed, rot });
        else segs.push({ x: fixed, z: c, rot });
      }
    }
  };

  addEdge("minZ", b.minZ, 0);
  addEdge("maxZ", b.maxZ, 0);
  addEdge("minX", b.minX, Math.PI / 2);
  addEdge("maxX", b.maxX, Math.PI / 2);

  return segs;
}

export function getGatePositions(def: EnclosureDef): Array<{ x: number; z: number; rot: number }> {
  const alongX = def.gate.edge === "minZ" || def.gate.edge === "maxZ";
  const lo = alongX ? def.bounds.minX : def.bounds.minZ;
  const hi = alongX ? def.bounds.maxX : def.bounds.maxZ;
  const c = lo + def.gate.t * (hi - lo);
  const b = def.bounds;
  const rot = def.gate.edge === "minX" || def.gate.edge === "maxX" ? Math.PI / 2 : 0;
  const x = def.gate.edge === "minX" ? b.minX : def.gate.edge === "maxX" ? b.maxX : c;
  const z = def.gate.edge === "minZ" ? b.minZ : def.gate.edge === "maxZ" ? b.maxZ : c;
  return [{ x, z, rot }];
}
