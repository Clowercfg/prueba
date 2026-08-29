import { create } from "zustand";
import { getCropEconomy } from "../config/economyConfig";
import { useEconomyStore } from "./economyStore";
import { useUpgradesStore } from "./upgradesStore";
import { useAuthStore } from "./authStore";
import { useWalletStore } from "./walletStore";
import { api, ApiError } from "../api/client";
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
 * - Comprar semillas descuenta su precio del saldo del jugador (y, autenticado,
 *   el backend da de alta las semillas server-side de forma atomica).
 * - La semilla se consume al sembrar (sin coste adicional). Autenticado, la
 *   parcela vive en el servidor con ready_at calculado por él (tiempo real).
 * - Al cosechar se recogen TODAS las unidades listas de golpe.
 * - Al vender se añade el precio de venta por unidad al saldo, VALIDADO por el
 *   servidor (stock y precio server-side; nunca se confia en el monto).
 * - Sin autenticación (dev sin Telegram) todo es local y usa el oro.
 */
interface CropStore {
  inventory: Record<string, CropInventory>;
  planted: PlantedCrop[];
  nextId: number;
  serverReady: boolean;
  /** Import (una vez) + GET autoritativo de inventario y parcelas. */
  syncCropsServer: () => Promise<void>;
  /** Da de alta semillas por bundle/combos (pago global previo server-side). */
  grantSeeds: (items: { cropId: string; qty: number }[]) => Promise<void>;
  /** Compra semillas: descuenta qty * seedPrice (USDT si autenticado, oro si no) y las añade al inventario. Devuelve null si OK, o el mensaje de error. */
  buySeed: (cropId: string, qty?: number) => Promise<string | null>;
  /** Siembra todas las semillas disponibles de un cultivo en una parcela (hasta capacidad granero). */
  plantCrop: (cropId: string, plotIndex: number) => Promise<{ planted: number } | false>;
  /** Encuentra el primer índice de parcela vacía, o -1 si no hay ninguna libre. */
  findEmptyPlot: () => number;
  /** Actualiza el estado de los cultivos según el tiempo transcurrido. */
  tick: () => void;
  /** Cosecha TODAS las unidades listas de una parcela. */
  harvestCrop: (id: number) => Promise<{ harvested: number } | false>;
  /** Vende cosecha del inventario: acredita USDT si autenticado, oro si no. */
  sellHarvest: (cropId: string, qty: number) => Promise<boolean>;
  /** Añade cosecha al inventario (herramienta de prueba/depuración). */
  addHarvest: (cropId: string, qty?: number) => boolean;
}

const emptyInventory = (): CropInventory => ({ seeds: 0, harvest: 0 });

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

const serverAuthed = () => useAuthStore.getState().status === "authenticated";
let cropsSyncInFlight = false;

export const useCropStore = create<CropStore>((set, get) => ({
  inventory: {},
  planted: [],
  nextId: 1,
  serverReady: false,

  syncCropsServer: async () => {
    if (!serverAuthed()) return;
    if (cropsSyncInFlight) return;
    cropsSyncInFlight = true;
    try {
      const localPlots = get().planted.map((p) => ({
        plotIndex: p.plotIndex,
        cropId: p.cropId,
        quantity: p.quantity,
        plantedAt: p.plantedAt,
      }));
      await api.cropsInit(get().inventory, localPlots);
      const r = await api.crops();
      set({
        inventory: r.crops,
        planted: r.plots.map((p) => ({
          id: p.plotIndex,
          cropId: p.cropId,
          plotIndex: p.plotIndex,
          plantedAt: p.plantedAt,
          state: Date.now() >= p.readyAt ? "ready" : "growing",
          quantity: p.quantity,
        })),
        serverReady: true,
      });
    } catch {
      /* sin backend: se conserva el estado local */
    } finally {
      cropsSyncInFlight = false;
    }
  },

  grantSeeds: async (items) => {
    if (!serverAuthed()) return;
    try {
      for (const it of items) {
        await api.cropsGrantSeeds(it.cropId, it.qty);
      }
    } catch {
      /* el pago del bundle ya se hizo; el alta no bloquea */
    }
  },

  buySeed: async (cropId, qty = 1) => {
    const econ = getCropEconomy(cropId);
    if (!econ || qty <= 0) return "error";
    const cost = econ.seedPrice * qty;

    if (serverAuthed()) {
      try {
        const r = await api.cropsPurchase(cropId, qty);
        set({ inventory: r.crops });
        useWalletStore.setState({ usdtMinor: r.availableMinor });
        return null;
      } catch (err) {
        return err instanceof ApiError ? err.message : "error de compra";
      }
    }

    if (!useEconomyStore.getState().spendGold(cost)) {
      return "sin saldo";
    }
    set((s) => ({
      inventory: { ...s.inventory, [cropId]: { ...(s.inventory[cropId] ?? emptyInventory()), seeds: (s.inventory[cropId]?.seeds ?? 0) + qty } },
    }));
    return null;
  },

  plantCrop: async (cropId, plotIndex) => {
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

    if (serverAuthed()) {
      try {
        const r = await api.cropsPlant(cropId, plotIndex, qtyToPlant, Date.now());
        set({
          inventory: r.crops,
          planted: r.plots.map((p) => ({
            id: p.plotIndex,
            cropId: p.cropId,
            plotIndex: p.plotIndex,
            plantedAt: p.plantedAt,
            state: Date.now() >= p.readyAt ? "ready" : "growing",
            quantity: p.quantity,
          })),
        });
        return { planted: qtyToPlant };
      } catch (err) {
        if (err instanceof ApiError) await get().syncCropsServer();
        return false;
      }
    }

    set((s) => ({
      inventory: {
        ...s.inventory,
        [cropId]: { ...(s.inventory[cropId] ?? emptyInventory()), seeds: (s.inventory[cropId]?.seeds ?? 0) - qtyToPlant },
      },
      planted: [
        ...s.planted,
        { id: plotIndex, cropId, plotIndex, plantedAt: Date.now(), state: "growing", quantity: qtyToPlant },
      ],
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

  harvestCrop: async (id) => {
    const planted = get().planted;
    const crop = planted.find((p) => p.id === id);
    if (!crop || crop.state !== "ready") return false;
    const qty = crop.quantity;

    if (serverAuthed()) {
      try {
        const r = await api.cropsHarvest(crop.plotIndex);
        if (r.ok !== true) return false;
        set((s) => ({
          inventory: r.crops,
          planted: s.planted.filter((p) => p.id !== id),
        }));
        return { harvested: r.harvested ?? qty };
      } catch (err) {
        if (err instanceof ApiError) await get().syncCropsServer();
        return false;
      }
    }

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

    if (serverAuthed()) {
      try {
        const r = await api.cropsSell(cropId, qty);
        set({ inventory: r.crops });
        useWalletStore.setState({ usdtMinor: r.availableMinor });
        return true;
      } catch {
        await get().syncCropsServer();
        return false;
      }
    }

    set((s) => ({
      inventory: {
        ...s.inventory,
        [cropId]: { ...(s.inventory[cropId] ?? emptyInventory()), harvest: (s.inventory[cropId]?.harvest ?? 0) - qty },
      },
    }));
    useEconomyStore.getState().addGold(qty * econ.sellPrice, "cosecha");
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