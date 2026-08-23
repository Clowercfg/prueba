import { create } from "zustand";
import type { AnimalKind } from "../types/entities";
import { getAnimalEconomy } from "../config/economyConfig";
import { useEconomyStore } from "./economyStore";

const HOUR_MS = 3600_000;

export interface VetEntry {
  id: number;
  kind: AnimalKind;
  sickAt: number;
  treatedAt: number | null;
  recoverAt: number | null;
}

export type VetStatus = "sick" | "recovering" | "healthy";

interface VetStore {
  sick: Record<number, VetEntry>;
  /** Próximo instante (ms) en que el animal puede volver a enfermar. */
  nextSickAt: Record<number, number>;
  lastCheckAt: number;
  makeSick: (id: number, kind: AnimalKind) => void;
  treat: (id: number) => boolean;
  markRecovered: (id: number) => void;
  statusOf: (id: number) => VetStatus;
  /** 0 = enfermo, 0.5 = recuperándose, 1 = sano. */
  productionFactor: (id: number) => number;
}

export const useVetStore = create<VetStore>((set, get) => ({
  sick: {},
  nextSickAt: {},
  lastCheckAt: Date.now(),

  makeSick: (id, kind) =>
    set((s) => ({
      sick: { ...s.sick, [id]: { id, kind, sickAt: Date.now(), treatedAt: null, recoverAt: null } },
    })),

  treat: (id) => {
    const entry = get().sick[id];
    if (!entry || entry.treatedAt !== null) return false;
    const def = getAnimalEconomy(entry.kind);
    if (!def) return false;
    if (!useEconomyStore.getState().spendGold(def.treatmentCost)) return false;
    const now = Date.now();
    set((s) => ({
      sick: {
        ...s.sick,
        [id]: { ...entry, treatedAt: now, recoverAt: now + def.recoveryHours * HOUR_MS },
      },
    }));
    return true;
  },

  markRecovered: (id) =>
    set((s) => {
      const next = { ...s.sick };
      delete next[id];
      return { sick: next };
    }),

  statusOf: (id) => {
    const entry = get().sick[id];
    if (!entry) return "healthy";
    if (entry.recoverAt !== null && Date.now() >= entry.recoverAt) return "healthy";
    return entry.treatedAt !== null ? "recovering" : "sick";
  },

  productionFactor: (id) => {
    const entry = get().sick[id];
    if (!entry) return 1;
    if (entry.recoverAt !== null && Date.now() >= entry.recoverAt) return 1;
    return entry.treatedAt !== null ? 0.5 : 0;
  },
}));
