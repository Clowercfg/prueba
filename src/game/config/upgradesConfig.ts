/**
 * Configuración de MEJORAS DE EDIFICIOS. Centralizada para balancear
 * precios, niveles, capacidades y efectos sin tocar la lógica del juego.
 *
 * Valores PROVISIONALES. Las mejoras NO generan dinero directamente:
 * solo aumentan capacidad, velocidad o eficiencia.
 *
 * Tipos:
 *  - capacity   🟢 Aumenta la cantidad máxima de animales/productos.
 *  - speed      🔵 Reduce el tiempo necesario para producir.
 *  - efficiency 🟡 Reduce determinados costos de producción.
 */

export type UpgradeType = "capacity" | "speed" | "efficiency";

export interface UpgradeLevelDef {
  level: number;
  /** Capacidad del nivel (solo para mejoras de capacidad). */
  capacity?: number;
  price: number;
  /** Ganancia diaria ESTIMADA (informativa, provisional). */
  estDailyGain?: number;
  /** Tiempo de procesamiento en horas (solo Procesadora). */
  processHours?: number;
  /** Costo por huevo en la Procesadora. */
  costPerEgg?: number;
}

export interface SpecialUpgradeDef {
  id: string;
  type: UpgradeType;
  icon: string;
  name: string;
  description: string;
  price: number;
  estDailyGain?: number;
}

export interface BuildingUpgradeDef {
  id: string;
  name: string;
  icon: string;
  type: UpgradeType;
  /** Unidad de capacidad: "gallinas" | "vacas" | "cerdos" | "huevos" | "u." | "máquinas". */
  unit: string;
  /** Nivel inicial ya desbloqueado (1 normalmente; 0 si el nivel 1 se compra). */
  startLevel: number;
  levels: UpgradeLevelDef[];
  specials: SpecialUpgradeDef[];
  /** Ganancia diaria ESTIMADA por unidad de capacidad (informativa, provisional). */
  estDailyGainPerUnit: number;
}

/** Mejora especial de producción del establo (8 h -> 7 h). */
export const STABLE_SPEED_UPGRADE = {
  normalHours: 8,
  improvedHours: 7,
};

/** Mejoras especiales de engorde de la pocilga (ciclo 7 días). */
export const PIG_CYCLE_DAYS = {
  normalDays: 7,
  engorde1Days: 6,
  engorde2Days: 5,
};

export const UPGRADES_ECONOMY: Record<string, BuildingUpgradeDef> = {
  coop: {
    id: "coop",
    name: "Gallinero",
    icon: "🐔",
    type: "capacity",
    unit: "gallinas",
    startLevel: 1,
    estDailyGainPerUnit: 0.6,
    levels: [
      { level: 1, capacity: 10, price: 0 },
      { level: 2, capacity: 20, price: 8, estDailyGain: 1.2 },
      { level: 3, capacity: 40, price: 18, estDailyGain: 2.4 },
      { level: 4, capacity: 75, price: 40, estDailyGain: 4.5 },
      { level: 5, capacity: 125, price: 75, estDailyGain: 7.5 },
      { level: 6, capacity: 200, price: 130, estDailyGain: 13 },
      { level: 7, capacity: 350, price: 250, estDailyGain: 25 },
      { level: 8, capacity: 500, price: 400, estDailyGain: 40 },
    ],
    specials: [],
  },
  stable: {
    id: "stable",
    name: "Establo",
    icon: "🐄",
    type: "capacity",
    unit: "vacas",
    startLevel: 1,
    estDailyGainPerUnit: 1.4,
    levels: [
      { level: 1, capacity: 5, price: 0 },
      { level: 2, capacity: 10, price: 15, estDailyGain: 1.5 },
      { level: 3, capacity: 20, price: 40, estDailyGain: 3.5 },
      { level: 4, capacity: 40, price: 90, estDailyGain: 7.5 },
      { level: 5, capacity: 75, price: 180, estDailyGain: 15 },
      { level: 6, capacity: 125, price: 350, estDailyGain: 30 },
      { level: 7, capacity: 200, price: 600, estDailyGain: 55 },
    ],
    specials: [
      {
        id: "stable-speed",
        type: "speed",
        icon: "⚡",
        name: "Producción rápida",
        description: "Producción cada 7 h en vez de 8 h.",
        price: 60,
        estDailyGain: 1.8,
      },
    ],
  },
  pigPen: {
    id: "pigPen",
    name: "Pocilga",
    icon: "🐖",
    type: "capacity",
    unit: "cerdos",
    startLevel: 1,
    estDailyGainPerUnit: 1.1,
    levels: [
      { level: 1, capacity: 5, price: 0 },
      { level: 2, capacity: 10, price: 10, estDailyGain: 1.1 },
      { level: 3, capacity: 25, price: 30, estDailyGain: 3.3 },
      { level: 4, capacity: 50, price: 75, estDailyGain: 8.3 },
      { level: 5, capacity: 100, price: 180, estDailyGain: 20 },
      { level: 6, capacity: 200, price: 400, estDailyGain: 44 },
      { level: 7, capacity: 400, price: 850, estDailyGain: 94 },
    ],
    specials: [
      {
        id: "pig-engorde-1",
        type: "speed",
        icon: "🍖",
        name: "Engorde I",
        description: "Ciclo de engorde de 7 a 6 días.",
        price: 75,
        estDailyGain: 2.5,
      },
      {
        id: "pig-engorde-2",
        type: "speed",
        icon: "🍖",
        name: "Engorde II",
        description: "Ciclo de engorde de 7 a 5 días.",
        price: 200,
        estDailyGain: 4,
      },
    ],
  },
  incubator: {
    id: "incubator",
    name: "Incubadora",
    icon: "🥚",
    type: "capacity",
    unit: "huevos",
    startLevel: 1,
    estDailyGainPerUnit: 0.9,
    levels: [
      { level: 1, capacity: 1, price: 0 },
      { level: 2, capacity: 2, price: 10, estDailyGain: 0.9 },
      { level: 3, capacity: 5, price: 30, estDailyGain: 2.7 },
      { level: 4, capacity: 10, price: 75, estDailyGain: 6.8 },
      { level: 5, capacity: 25, price: 200, estDailyGain: 18 },
    ],
    specials: [],
  },
  granary: {
    id: "granary",
    name: "Granero",
    icon: "🌾",
    type: "capacity",
    unit: "u.",
    startLevel: 1,
    estDailyGainPerUnit: 0,
    levels: [
      { level: 1, capacity: 100, price: 0 },
      { level: 2, capacity: 250, price: 5 },
      { level: 3, capacity: 500, price: 12 },
      { level: 4, capacity: 1000, price: 30 },
      { level: 5, capacity: 2500, price: 75 },
      { level: 6, capacity: 5000, price: 180 },
      { level: 7, capacity: 10000, price: 400 },
      { level: 8, capacity: 25000, price: 900 },
    ],
    specials: [],
  },
  processing: {
    id: "processing",
    name: "Procesadora",
    icon: "🏭",
    type: "capacity",
    unit: "huevos",
    startLevel: 0,
    estDailyGainPerUnit: 0.01,
    levels: [
      { level: 1, capacity: 2, price: 5, processHours: 2, costPerEgg: 0.01 },
      { level: 2, capacity: 4, price: 10, processHours: 1.75, costPerEgg: 0.009 },
      { level: 3, capacity: 6, price: 20, processHours: 1.5, costPerEgg: 0.008 },
      { level: 4, capacity: 10, price: 35, processHours: 1.25, costPerEgg: 0.007 },
      { level: 5, capacity: 20, price: 60, processHours: 1, costPerEgg: 0.006 },
    ],
    specials: [],
  },
};

export const UPGRADE_BUILDINGS = Object.values(UPGRADES_ECONOMY);

export function getBuildingUpgrade(id: string): BuildingUpgradeDef | null {
  return UPGRADES_ECONOMY[id] ?? null;
}

export function findSpecial(id: string): { building: BuildingUpgradeDef; special: SpecialUpgradeDef } | null {
  for (const building of UPGRADE_BUILDINGS) {
    const special = building.specials.find((s) => s.id === id);
    if (special) return { building, special };
  }
  return null;
}

/** Horas del intervalo de producción del establo según la mejora comprada. */
export function stableProductionHours(speedBought: boolean): number {
  return speedBought ? STABLE_SPEED_UPGRADE.improvedHours : STABLE_SPEED_UPGRADE.normalHours;
}

/** Días del ciclo de engorde de la pocilga según las mejoras compradas. */
export function pigCycleDays(engorde1: boolean, engorde2: boolean): number {
  let days = PIG_CYCLE_DAYS.normalDays;
  if (engorde1) days = Math.min(days, PIG_CYCLE_DAYS.engorde1Days);
  if (engorde2) days = Math.min(days, PIG_CYCLE_DAYS.engorde2Days);
  return days;
}

/** Obtiene los parámetros de procesamiento para un nivel dado de la Procesadora. */
export function getProcessorLevelDef(level: number): { capacity: number; processHours: number; costPerEgg: number } {
  const def = UPGRADES_ECONOMY.processing;
  const lvl = def.levels.find((l) => l.level === level);
  if (!lvl) {
    const fallback = def.levels[0];
    return { capacity: fallback.capacity ?? 2, processHours: fallback.processHours ?? 2, costPerEgg: fallback.costPerEgg ?? 0.01 };
  }
  return {
    capacity: lvl.capacity ?? 2,
    processHours: lvl.processHours ?? 2,
    costPerEgg: lvl.costPerEgg ?? 0.01,
  };
}
