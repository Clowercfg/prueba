import { padCenterWorld, PADS } from "./layoutConfig";
import type { BuildingType } from "./worldConfig";

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

/**
 * Metadatos de edificios (uid/tipo/nivel para UI y economía). Las posiciones
 * VISUALES de los edificios viven en farmEntities/PADS (world space único);
 * aquí solo quedan como identificación, nunca para render ni colisión.
 */
export const STATIC_BUILDINGS: StaticBuilding[] = [
  { uid: "house-1", type: "house", position: [0, 0, 0], rotation: 0, level: 1 },
  { uid: "barn-1", type: "barn", position: [0, 0, 0], rotation: 0, level: 2 },
  { uid: "workshop-1", type: "workshop", position: [0, 0, 0], rotation: 0, level: 1 },
  { uid: "warehouse-1", type: "warehouse", position: [0, 0, 0], rotation: 0, level: 1 },
  { uid: "greenhouse-1", type: "greenhouse", position: [0, 0, 0], rotation: 0, level: 1 },
];

/**
 * Obstáculos de la IA en el WORLD SPACE ÚNICO (tiles 0..28): la huella real
 * del granero dibujado (PADS.barn) y el estanque visual. Ninguno invade los
 * bounds de ENCLOSURES, así que la IA esquiva sin pelear con sus límites.
 */
export const OBSTACLES: Obstacle[] = (() => {
  const barnCenter = padCenterWorld(PADS.barn);
  const barnR = Math.hypot(PADS.barn.x1 - PADS.barn.x0 + 1, PADS.barn.y1 - PADS.barn.y0 + 1) / 2;
  return [
    { x: barnCenter.x, z: barnCenter.y, radius: barnR * 0.82 },
    // Estanque dibujado en terrain/pond.png anclado en worldOf(23.5, 21.5).
    { x: 24.0, z: 22.0, radius: 2.9 },
  ];
})();

export function isNearObstacle(x: number, z: number, margin = 0): boolean {
  for (const o of OBSTACLES) {
    if (Math.hypot(x - o.x, z - o.z) < o.radius + margin) return true;
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
