import { create } from "zustand";
import type { AnimalKind } from "../types/entities";
import { useEconomyStore } from "./economyStore";
import {
  UPGRADES_ECONOMY,
  getBuildingUpgrade,
  findSpecial,
  stableProductionHours,
  pigCycleDays,
  PIG_CYCLE_DAYS,
} from "../config/upgradesConfig";

function defaultLevels(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of Object.values(UPGRADES_ECONOMY)) out[def.id] = def.startLevel;
  return out;
}

interface UpgradesStore {
  levels: Record<string, number>;
  specials: Record<string, boolean>;
  /** Compra el siguiente nivel del edificio (orden obligatorio). */
  buyLevel: (buildingId: string) => boolean;
  /** Compra una mejora especial de un solo uso. */
  buySpecial: (specialId: string) => boolean;
  /** Capacidad actual del edificio. */
  capacityOf: (buildingId: string) => number;
  /** Capacidad del siguiente nivel (o la actual si está al máximo). */
  nextCapacityOf: (buildingId: string) => number;
  /** Nivel siguiente comprable o null si está al máximo. */
  nextLevelOf: (buildingId: string) => { level: number; price: number; capacity?: number } | null;
  /** Factor de intervalo de producción para un animal (1 = sin mejora). */
  intervalFactor: (kind: AnimalKind) => number;
  /** Días del ciclo de engorde de la pocilga con las mejoras compradas. */
  cycleDaysOf: () => number;
  reset: () => void;
}

const initial = { levels: defaultLevels(), specials: {} as Record<string, boolean> };

export const useUpgradesStore = create<UpgradesStore>((set, get) => ({
  levels: initial.levels,
  specials: initial.specials,

  buyLevel: (buildingId) => {
    const def = getBuildingUpgrade(buildingId);
    if (!def) return false;
    const cur = get().levels[buildingId] ?? def.startLevel;
    const next = def.levels.find((l) => l.level === cur + 1);
    if (!next) return false;
    if (next.price > 0 && !useEconomyStore.getState().spendGold(next.price)) return false;
    const levels = { ...get().levels, [buildingId]: next.level };
    set({ levels });
    return true;
  },

  buySpecial: (specialId) => {
    const found = findSpecial(specialId);
    if (!found || get().specials[specialId]) return false;
    const { special } = found;
    if (special.price > 0 && !useEconomyStore.getState().spendGold(special.price)) return false;
    const specials = { ...get().specials, [specialId]: true };
    set({ specials });
    return true;
  },

  capacityOf: (buildingId) => {
    const def = getBuildingUpgrade(buildingId);
    if (!def) return 0;
    const cur = get().levels[buildingId] ?? def.startLevel;
    const lvl = def.levels.find((l) => l.level === cur);
    return lvl?.capacity ?? 0;
  },

  nextCapacityOf: (buildingId) => {
    const def = getBuildingUpgrade(buildingId);
    if (!def) return 0;
    const cur = get().levels[buildingId] ?? def.startLevel;
    const lvl = def.levels.find((l) => l.level === cur + 1);
    return lvl?.capacity ?? get().capacityOf(buildingId);
  },

  nextLevelOf: (buildingId) => {
    const def = getBuildingUpgrade(buildingId);
    if (!def) return null;
    const cur = get().levels[buildingId] ?? def.startLevel;
    const next = def.levels.find((l) => l.level === cur + 1);
    if (!next) return null;
    return { level: next.level, price: next.price, capacity: next.capacity };
  },

  intervalFactor: (kind) => {
    if (kind === "cow") {
      const normal = stableProductionHours(false);
      const improved = stableProductionHours(get().specials["stable-speed"] === true);
      return improved / normal;
    }
    if (kind === "pig") {
      const normal = PIG_CYCLE_DAYS.normalDays;
      const current = get().cycleDaysOf();
      return current / normal;
    }
    return 1;
  },

  cycleDaysOf: () => pigCycleDays(get().specials["pig-engorde-1"] === true, get().specials["pig-engorde-2"] === true),

  reset: () => {
    const levels = defaultLevels();
    const specials: Record<string, boolean> = {};
    set({ levels, specials });
  },
}));
