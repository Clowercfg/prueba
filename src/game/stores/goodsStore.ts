import { create } from "zustand";
import { getGoodsEconomy } from "../config/economyConfig";
import { useEconomyStore } from "./economyStore";
import { useAuthStore } from "./authStore";
import { useWalletStore } from "./walletStore";
import { animalRegistry } from "./farmStore";
import { api, ApiError } from "../api/client";

const DEFAULT_GOODS: Record<string, number> = {};

export interface AddGoodsOpts {
  /** Origen de la producción: animal (tiempo) o procesamiento (pool de insumo). */
  via?: "animal" | "processing";
  /** Especie cuando via === 'animal'. */
  kind?: string;
  /** Insumo consumido cuando via === 'processing'. */
  inputGoodId?: string;
}

interface GoodsStore {
  inventory: Record<string, number>;
  /** true tras la primera sincronización autoritativa con el backend. */
  serverReady: boolean;
  /** Import (una vez) + GET del inventario autoritativo del servidor. */
  syncServer: () => Promise<void>;
  /** Registra animales comprados en el backend (útil solo autenticado). */
  registerAnimals: (items: { kind: string; qty: number }[]) => Promise<void>;
  /** Vende producto del Almacén: acredita USDT si autenticado, oro si no. */
  sellGoods: (goodId: string, qty: number) => Promise<boolean>;
  /** Añade producto validado por el servidor. Devuelve lo realmente acreditado. */
  addGoods: (goodId: string, qty?: number, opts?: AddGoodsOpts) => Promise<number>;
  /** Retira producto (procesamiento). Devuelve false si no hay suficiente. */
  removeGoods: (goodId: string, qty: number) => Promise<boolean>;
  /** Devuelve al inventario producto consumido (pool) si un pago posterior falla. */
  cancelConsume: (goodId: string, qty: number) => Promise<boolean>;
  /** Reinicia al estado por defecto (debug). */
  reset: () => void;
}

let syncInFlight = false;
const serverAuthed = () => useAuthStore.getState().status === "authenticated";

export const useGoodsStore = create<GoodsStore>((set, get) => ({
  inventory: { ...DEFAULT_GOODS },
  serverReady: false,

  syncServer: async () => {
    if (!serverAuthed()) return;
    if (syncInFlight) return;
    syncInFlight = true;
    try {
      const counts: Record<string, number> = {};
      for (const a of animalRegistry.values()) {
        counts[a.kind] = (counts[a.kind] ?? 0) + 1;
      }
      await api.goodsInit(get().inventory, counts);
      const r = await api.goods();
      set({ inventory: r.goods, serverReady: true });
    } catch {
      /* sin backend: se conserva el estado local */
    } finally {
      syncInFlight = false;
    }
  },

  registerAnimals: async (items) => {
    if (!serverAuthed()) return;
    try {
      await api.goodsRegisterAnimals(items);
    } catch {
      /* la compra ya está hecha; el registro no bloquea */
    }
  },

  sellGoods: async (goodId, qty) => {
    const econ = getGoodsEconomy(goodId);
    if (!econ || qty <= 0) return false;
    const inv = get().inventory;
    if ((inv[goodId] ?? 0) < qty) return false;

    if (serverAuthed()) {
      try {
        const r = await api.goodsSell(goodId, qty);
        set({ inventory: r.goods });
        useWalletStore.setState({ usdtMinor: r.availableMinor });
        return true;
      } catch {
        await get().syncServer();
        return false;
      }
    }

    const next = { ...inv, [goodId]: (inv[goodId] ?? 0) - qty };
    set({ inventory: next });
    useEconomyStore.getState().addGold(qty * econ.sellPrice, "producto");
    return true;
  },

  addGoods: async (goodId, qty = 1, opts) => {
    if (qty <= 0) return 0;

    if (serverAuthed()) {
      try {
        const r = await api.goodsProduce(goodId, qty, opts?.via ?? "animal", opts?.kind, opts?.inputGoodId);
        if (r.credited > 0) set({ inventory: r.goods });
        return r.credited;
      } catch (err) {
        // Sin backend (dev local o caída): fallback local; no convierte a USDT.
        if (err instanceof ApiError && err.status === 400) return 0;
        const next = { ...get().inventory, [goodId]: (get().inventory[goodId] ?? 0) + qty };
        set({ inventory: next });
        return qty;
      }
    }

    const next = { ...get().inventory, [goodId]: (get().inventory[goodId] ?? 0) + qty };
    set({ inventory: next });
    return qty;
  },

  removeGoods: async (goodId, qty) => {
    if (qty <= 0) return false;
    const inv = get().inventory;
    if ((inv[goodId] ?? 0) < qty) return false;

    if (serverAuthed()) {
      try {
        const r = await api.goodsConsume(goodId, qty);
        set({ inventory: r.goods });
        return r.ok === true;
      } catch (err) {
        if (err instanceof ApiError || err instanceof Error) await get().syncServer();
        return false;
      }
    }

    const next = { ...inv, [goodId]: (inv[goodId] ?? 0) - qty };
    set({ inventory: next });
    return true;
  },

  cancelConsume: async (goodId, qty) => {
    if (qty <= 0) return false;

    if (serverAuthed()) {
      try {
        const r = await api.goodsCancelConsume(goodId, qty);
        set({ inventory: r.goods });
        return r.ok === true;
      } catch (err) {
        if (err instanceof ApiError || err instanceof Error) await get().syncServer();
        return false;
      }
    }

    const next = { ...get().inventory, [goodId]: (get().inventory[goodId] ?? 0) + qty };
    set({ inventory: next });
    return true;
  },

  reset: () => {
    set({ inventory: { ...DEFAULT_GOODS } });
  },
}));