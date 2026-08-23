export const WORLD = {
  size: 640,
  half: 320,
  farmRadius: 90,
  edgeFalloff: 150,
  terrainHeightScale: 14,
  maxTerrainHeight: 18,
} as const;

export const CAMERA = {
  pitchMin: (20 * Math.PI) / 180,
  pitchMax: (68 * Math.PI) / 180,
  pitchDefault: (47 * Math.PI) / 180,
  distanceMin: 14,
  distanceMax: 260,
  distanceDefault: 50,
  panSpeed: 95,
  panSpeedBoost: 2.1,
  rotateSpeed: 0.0038,
  zoomSpeed: 0.0016,
  damping: 6,
  minHeightAboveTerrain: 2.5,
} as const;

/**
 * Modos de tiempo del juego. El modo principal es REAL (sincronizado con el
 * reloj del sistema). PAUSED y SIM quedan preparados pero sin exponerse en UI.
 */
export const TIME_MODES = {
  real: { label: "Tiempo real" },
  paused: { label: "Pausa" },
  sim: { label: "Velocidad simulada" },
} as const;

export const SIM_SPEEDS = [1, 2, 5, 10] as const;

export const WEATHER = {
  clear: { label: "Despejado", fog: 0.00035, sunIntensity: 2.4, rain: 0 },
  cloudy: { label: "Nublado", fog: 0.0006, sunIntensity: 1.1, rain: 0 },
  rain: { label: "Lluvia", fog: 0.0009, sunIntensity: 0.65, rain: 1 },
} as const;

export type WeatherKind = keyof typeof WEATHER;

export const ANIMAL_LIMIT = 40;

export interface BuildingDef {
  name: string;
  label: string;
  description: string;
  size: [number, number];
}

/** Catálogo de infraestructura existente (no colocable). */
export const BUILDING_CONFIG = {
  barn: {
    name: "Granero",
    label: "Granero",
    description: "Almacena grano y forraje, y sirve de taller para el ensamblado de cosechas.",
    size: [16, 12] as [number, number],
  },
  house: {
    name: "Casa",
    label: "Casa principal",
    description: "Residencia principal de la granja.",
    size: [11, 9] as [number, number],
  },
  cowPen: {
    name: "Corral de vacas",
    label: "Corral de vacas",
    description: "Área cercada donde viven las vacas.",
    size: [34, 28] as [number, number],
  },
  chickenPen: {
    name: "Corral de pollos",
    label: "Corral de pollos",
    description: "Área cercada donde viven los pollos.",
    size: [18, 16] as [number, number],
  },
  warehouse: {
    name: "Almacén",
    label: "Almacén",
    description: "Guardar productos de la granja antes de la venta.",
    size: [14, 10] as [number, number],
  },
  greenhouse: {
    name: "Invernadero",
    label: "Invernadero",
    description: "Cultivo protegido para hortalizas fuera de temporada.",
    size: [12, 8] as [number, number],
  },
  workshop: {
    name: "Taller",
    label: "Taller",
    description: "Repara herramientas y produce fertilizante.",
    size: [10, 8] as [number, number],
  },
} satisfies Record<string, BuildingDef>;

export type BuildingType = keyof typeof BUILDING_CONFIG;

export const ANIMAL_COLORS = {
  cow: {
    coat: "#6b513a",
    patch: "#f2efe7",
    dark: "#3a2c22",
    pink: "#e8b4a0",
  },
  chicken: {
    body: "#e8dcc8",
    comb: "#d63f2e",
    beak: "#e8a33d",
    tail: "#7a4a2e",
  },
} as const;
