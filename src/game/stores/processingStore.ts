import { create } from "zustand";
import { PROCESS_ECONOMY } from "../config/processingConfig";
import { getProcessorLevelDef } from "../config/upgradesConfig";
import { useEconomyStore } from "./economyStore";
import { useGoodsStore } from "./goodsStore";
import { useUpgradesStore } from "./upgradesStore";

export interface ProcessingJob {
  id: string;
  recipeId: string;
  inputGoodId: string;
  outputGoodId: string;
  qty: number;
  costPerUnit: number;
  totalCost: number;
  startTime: number;
  endTime: number;
  level: number;
}

let nextId = Date.now();

interface ProcessingStore {
  jobs: ProcessingJob[];
  /** Verifica si se puede procesar una cantidad dada de una receta. */
  canProcess: (
    recipeId: string,
    qty: number
  ) => { ok: boolean; reason?: string };
  /** Inicia un ciclo de procesamiento. Descuenta gold + huevos, crea job. */
  startProcess: (recipeId: string, qty: number) => boolean;
  /** AÃ±ade 1 huevo a un job en curso. Descuenta egg + gold, extiende endTime. */
  addToJob: (jobId: string) => boolean;
  /** Tick: entrega productos de jobs completados. Llamar cada ~1s. */
  tick: () => void;
  /** Reinicia (debug). */
  reset: () => void;
}

export const useProcessingStore = create<ProcessingStore>((set, get) => ({
  jobs: [],

  canProcess: (recipeId, qty) => {
    const recipe = PROCESS_ECONOMY[recipeId];
    if (!recipe) return { ok: false, reason: "recipe_not_found" };
    if (qty <= 0) return { ok: false, reason: "invalid_qty" };

    const level = useUpgradesStore.getState().capacityOf("processing");
    if (level <= 0) return { ok: false, reason: "no_processor" };

    const def = getProcessorLevelDef(level);
    if (qty > def.capacity)
      return { ok: false, reason: "exceeds_capacity", };

    const eggs = useGoodsStore.getState().inventory[recipe.inputGoodId] ?? 0;
    if (eggs < qty) return { ok: false, reason: "no_eggs" };

    const totalCost = qty * def.costPerEgg;
    const gold = useEconomyStore.getState().gold;
    if (gold < totalCost) return { ok: false, reason: "no_balance" };

    return { ok: true };
  },

  startProcess: (recipeId, qty) => {
    const check = get().canProcess(recipeId, qty);
    if (!check.ok) return false;

    const recipe = PROCESS_ECONOMY[recipeId];
    if (!recipe) return false;

    const level = useUpgradesStore.getState().capacityOf("processing");
    const def = getProcessorLevelDef(level);
    const totalCost = qty * def.costPerEgg;

    const eco = useEconomyStore.getState();
    if (!eco.spendGold(totalCost)) return false;

    const goods = useGoodsStore.getState();
    if (!goods.removeGoods(recipe.inputGoodId, qty)) {
      eco.addGold(totalCost, "reembolso");
      return false;
    }

    const now = Date.now();
    const job: ProcessingJob = {
      id: String(nextId++),
      recipeId,
      inputGoodId: recipe.inputGoodId,
      outputGoodId: recipe.outputGoodId,
      qty,
      costPerUnit: def.costPerEgg,
      totalCost,
      startTime: now,
      endTime: now + qty * def.processHours * 3600000,
      level,
    };

    set({ jobs: [...get().jobs, job] });
    return true;
  },

  addToJob: (jobId) => {
    const jobs = get().jobs;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return false;

    const now = Date.now();
    if (now >= job.endTime) return false;

    const level = useUpgradesStore.getState().capacityOf("processing");
    const def = getProcessorLevelDef(level);
    if (job.qty >= def.capacity) return false;

    const eggs = useGoodsStore.getState().inventory[job.inputGoodId] ?? 0;
    if (eggs < 1) return false;

    const eco = useEconomyStore.getState();
    if (!eco.spendGold(def.costPerEgg)) return false;

    const goods = useGoodsStore.getState();
    if (!goods.removeGoods(job.inputGoodId, 1)) {
      eco.addGold(def.costPerEgg, "reembolso");
      return false;
    }

    const updated = jobs.map((j) =>
      j.id === jobId
        ? {
            ...j,
            qty: j.qty + 1,
            totalCost: j.totalCost + def.costPerEgg,
            endTime: j.endTime + def.processHours * 3600000,
          }
        : j
    );
    set({ jobs: updated });
    return true;
  },

  tick: () => {
    const now = Date.now();
    const jobs = get().jobs;
    if (jobs.length === 0) return;

    const completed: ProcessingJob[] = [];
    const remaining: ProcessingJob[] = [];

    for (const job of jobs) {
      if (now >= job.endTime) completed.push(job);
      else remaining.push(job);
    }

    if (completed.length === 0) return;

    const goods = useGoodsStore.getState();
    for (const job of completed) {
      goods.addGoods(job.outputGoodId, job.qty);
    }

    set({ jobs: remaining });
  },

  reset: () => {
    set({ jobs: [] });
  },
}));
