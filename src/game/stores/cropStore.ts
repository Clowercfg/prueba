import { create } from "zustand";
import { getCropEconomy } from "../config/economyConfig";
import { useEconomyStore } from "./economyStore";
import { useUpgradesStore } from "./upgradesStore";
import { useAuthStore } from "./authStore";
import { useWalletStore } from "./walletStore";
import { PLOT_PADS } from "../config/layoutConfig";

export type CropState = "growing" | "ready";

export interface PlantedCrop {
  id: number;
  cropId: string;
  plotIndex: number;
  plantedAt: number;
  state: CropState;
  quantity: number;
}

export interface CropInventory {
  seeds: number;
  harvest: number;
}

/**
 * Economía de cultivos. Reglas:
 * - Comprar semillas descuenta su precio del saldo del jugador.
 * - La semilla se consume al sembrar (sin coste adicional).
 * - Al sembrar se plantan TODAS las semillas disponibles de golpe (hasta capacidad del granero).
 * - Tras `growthHours` el cultivo queda listo para cosechar.
 * - Al cosechar se recogen TODAS las unidades listas de golpe.
 * - Al vender se añade el precio de venta por unidad al saldo.
 */
interface CropStore {
  inventory: Record<string, CropInventory>;
  planted: PlantedCrop[];
  nextId: number;
  /** Compra semillas: descuenta qty * seedPrice (USDT si autenticado, oro si no) y las añade al inventario. */
  buySeed: (cropId: string, qty?: number) => Promise<boolean>;
  /** Siembra todas las semillas disponibles de un cultivo en una parcela (hasta capacidad granero). */
  plantCrop: (cropId: string, plotIndex: number) => { planted: number } | false;
  /** Encuentra el primer índice de parcela vacía, o -1 si no hay ninguna libre. */
  findEmptyPlot: () => number;
  /** Actualiza el estado de los cultivos según el tiempo transcurrido. */
  tick: () => void;
  /** Cosecha TODAS las unidades listas de una parcela. */
  harvestCrop: (id: number) => { harvested: number } | false;
  /** Vende cosecha del inventario: acredita USDT si autenticado, oro si no. */
  sellHarvest: (cropId: string, qty: number) => Promise<boolean>;
  /** Añade cosecha al inventario (herramienta de prueba/depuración). */
  addHarvest: (cropId: string, qty?: number) => boolean;
}

const emptyInventory = (): CropInventory => ({ seeds: 0, harvest: 0 });

/** Semillas iniciales por cultivo (configurable). */
const STARTING_SEEDS: Record<string, number> = { wheat: 3, carrot: 3, potato: 3 };

/** Cosecha inicial por cultivo (configurable). Solo para pruebas/ajustes. */
const STARTING_HARVEST: Record<string, number> = { wheat: 5, carrot: 4, potato: 3 };

/** Milisegundos totales de crecimiento de un cultivo. */
export function growthMsOf(planted: Pick<PlantedCrop, "cropId">): number {
  const econ = getCropEconomy(planted.cropId);
  return econ ? econ.growthHours * 3600 * 1000 : 0;
}

/** Progreso de crecimiento 0..1 según el tiempo transcurrido. */
export function growthProgressOf(planted: PlantedCrop): number {
  const ms = growthMsOf(planted);
  return ms > 0 ? Math.min(1, (Date.now() - planted.plantedAt) / ms) : 1;
}

export const useCropStore = create<CropStore>((set, get) => ({
  inventory: Object.fromEntries(
    Object.entries(STARTING_SEEDS).map(([id, seeds]) => [id, { seeds, harvest: STARTING_HARVEST[id] ?? 0 }])
  ),
  planted: [],
  nextId: 1,

  buySeed: async (cropId, qty = 1) => {
    const econ = getCropEconomy(cropId);
    if (!econ || qty <= 0) return false;
    const cost = econ.seedPrice * qty;
    if (useAuthStore.getState().status === "authenticated") {
      const err = await useWalletStore.getState().spendUSD(Math.round(cost * 100), `seed:${cropId}`);
      if (err) return false;
    } else if (!useEconomyStore.getState().spendGold(cost)) {
      return false;
    }
    set((s) => ({
      inventory: { ...s.inventory, [cropId]: { ...(s.inventory[cropId] ?? emptyInventory()), seeds: (s.inventory[cropId]?.seeds ?? 0) + qty } },
    }));
    return true;
  },

  plantCrop: (cropId, plotIndex) => {
    const econ = getCropEconomy(cropId);
    if (!econ) return false;
    if (plotIndex < 0 || plotIndex >= PLOT_PADS.length) return false;
    if (get().planted.some((p) => p.plotIndex === plotIndex)) return false;
    const inv = get().inventory[cropId];
    if (!inv || inv.seeds < 1) return false;
    const granaryCapacity = useUpgradesStore.getState().capacityOf("granary");
    const currentPlanted = get().planted.reduce((sum, p) => sum + p.quantity, 0);
    const availableSpace = Math.max(0, granaryCapacity - currentPlanted);
    const qtyToPlant = Math.min(inv.seeds, availableSpace);
    if (qtyToPlant <= 0) return false;
    set((s) => ({
      inventory: {
        ...s.inventory,
        [cropId]: { ...(s.inventory[cropId] ?? emptyInventory()), seeds: (s.inventory[cropId]?.seeds ?? 0) - qtyToPlant },
      },
      planted: [
        ...s.planted,
        { id: s.nextId, cropId, plotIndex, plantedAt: Date.now(), state: "growing", quantity: qtyToPlant },
      ],
      nextId: s.nextId + 1,
    }));
    return { planted: qtyToPlant };
  },

  findEmptyPlot: () => {
    const occupied = new Set(get().planted.map((p) => p.plotIndex));
    for (let i = 0; i < PLOT_PADS.length; i++) {
      if (!occupied.has(i)) return i;
    }
    return -1;
  },

  tick: () => {
    const now = Date.now();
    const changed = get().planted.some((p) => {
      if (p.state === "ready") return false;
      const econ = getCropEconomy(p.cropId);
      return econ && now - p.plantedAt >= econ.growthHours * 3600 * 1000;
    });
    if (!changed) return;
    set((s) => ({
      planted: s.planted.map((p) => {
        if (p.state === "ready") return p;
        const econ = getCropEconomy(p.cropId);
        const ready = econ && now - p.plantedAt >= econ.growthHours * 3600 * 1000;
        return ready ? { ...p, state: "ready" } : p;
      }),
    }));
  },

  harvestCrop: (id) => {
    const planted = get().planted;
    const crop = planted.find((p) => p.id === id);
    if (!crop || crop.state !== "ready") return false;
    const qty = crop.quantity;
    set((s) => ({
      planted: s.planted.filter((p) => p.id !== id),
      inventory: {
        ...s.inventory,
        [crop.cropId]: { ...(s.inventory[crop.cropId] ?? emptyInventory()), harvest: (s.inventory[crop.cropId]?.harvest ?? 0) + qty },
      },
    }));
    return { harvested: qty };
  },

  sellHarvest: async (cropId, qty) => {
    const econ = getCropEconomy(cropId);
    if (!econ || qty <= 0) return false;
    const inv = get().inventory[cropId];
    if (!inv || inv.harvest < qty) return false;
    set((s) => ({
      inventory: {
        ...s.inventory,
        [cropId]: { ...(s.inventory[cropId] ?? emptyInventory()), harvest: (s.inventory[cropId]?.harvest ?? 0) - qty },
      },
    }));
    if (useAuthStore.getState().status === "authenticated") {
      await useWalletStore.getState().earnUSD(Math.round(qty * econ.sellPrice * 100), `crop:${cropId}`);
    } else {
      useEconomyStore.getState().addGold(qty * econ.sellPrice, "cosecha");
    }
    return true;
  },

  addHarvest: (cropId, qty = 1) => {
    if (qty <= 0) return false;
    set((s) => ({
      inventory: {
        ...s.inventory,
        [cropId]: { ...(s.inventory[cropId] ?? emptyInventory()), harvest: (s.inventory[cropId]?.harvest ?? 0) + qty },
      },
    }));
    return true;
  },
}));
