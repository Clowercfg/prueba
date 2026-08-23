import { BUILDING_CONFIG, type BuildingType } from "./worldConfig";

export interface StaticBuilding {
  uid: string;
  type: BuildingType;
  position: [number, number, number];
  rotation: number;
  level: number;
}

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export const STATIC_BUILDINGS: StaticBuilding[] = [
  { uid: "house-1", type: "house", position: [-18, 0, 28], rotation: 0.3, level: 1 },
  { uid: "barn-1", type: "barn", position: [2, 0, 28], rotation: 0, level: 2 },
  { uid: "workshop-1", type: "workshop", position: [-18, 0, 10], rotation: 0, level: 1 },
  { uid: "warehouse-1", type: "warehouse", position: [2, 0, 10], rotation: 0, level: 1 },
  { uid: "greenhouse-1", type: "greenhouse", position: [-18, 0, -8], rotation: 0, level: 1 },
];

export const POND = { x: 12, z: -24, radius: 11.5 } as const;

export const FENCE_SEGMENTS: Array<[number, number, number]> = [
  [-24, 24, 0],
  [-24, 12, 0],
  [-24, 0, 0],
  [-24, -12, 0],
  [-24, -24, 0],
  [12, -13, 0],
  [12, -35, 0],
  [-0.5, -24, Math.PI / 2],
  [24.5, -24, Math.PI / 2],
];

export const OBSTACLES: Obstacle[] = STATIC_BUILDINGS.map((b) => {
  const radii: Record<BuildingType, number> = {
    barn: 12,
    house: 8,
    cowPen: 18,
    chickenPen: 11,
    warehouse: 9,
    greenhouse: 8,
    workshop: 7,
  };
  return { x: b.position[0], z: b.position[2], radius: radii[b.type] };
}).concat([{ x: POND.x, z: POND.z, radius: POND.radius }]);

export function isNearObstacle(x: number, z: number, margin = 0): boolean {
  for (const o of OBSTACLES) {
    if (Math.hypot(x - o.x, z - o.z) < o.radius + margin) return true;
  }
  return false;
}

/** ¿Está el punto (x, z) dentro de la huella de algún edificio (con margen)? */
export function isInsideBuilding(x: number, z: number, margin = 0.5): boolean {
  for (const b of STATIC_BUILDINGS) {
    const size = BUILDING_CONFIG[b.type].size;
    const hw = size[0] / 2 + margin;
    const hd = size[1] / 2 + margin;
    const cos = Math.cos(b.rotation);
    const sin = Math.sin(b.rotation);
    const dx = x - b.position[0];
    const dz = z - b.position[2];
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) < hw && Math.abs(lz) < hd) return true;
  }
  return false;
}

export const BUILDING_LABEL: Record<BuildingType, string> = {
  barn: "Granero",
  house: "Casa principal",
  cowPen: "Corral de vacas",
  chickenPen: "Corral de pollos",
  warehouse: "Almacén",
  greenhouse: "Invernadero",
  workshop: "Taller",
};
