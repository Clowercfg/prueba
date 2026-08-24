import { create } from "zustand";
import { getGoodsEconomy } from "../config/economyConfig";
import { useEconomyStore } from "./economyStore";

const DEFAULT_GOODS: Record<string, number> = { milk: 6, eggs: 8, honey: 4, cheese: 5 };

interface GoodsStore {
  inventory: Record<string, number>;
  /** Vende producto del Almacén: añade qty * sellPrice al saldo. */
  sellGoods: (goodId: string, qty: number) => boolean;
  /** Añade producto al inventario. */
  addGoods: (goodId: string, qty?: number) => boolean;
  /** Retira producto del inventario. Devuelve false si no hay suficiente. */
  removeGoods: (goodId: string, qty: number) => boolean;
  /** Reinicia al estado por defecto (debug). */
  reset: () => void;
}

export const useGoodsStore = create<GoodsStore>((set, get) => ({
  inventory: { ...DEFAULT_GOODS },

  sellGoods: (goodId, qty) => {
    const econ = getGoodsEconomy(goodId);
    if (!econ || qty <= 0) return false;
    const inv = get().inventory;
    if ((inv[goodId] ?? 0) < qty) return false;
    useEconomyStore.getState().addGold(qty * econ.sellPrice, "producto");
    const next = { ...inv, [goodId]: (inv[goodId] ?? 0) - qty };
    set({ inventory: next });
    return true;
  },

  addGoods: (goodId, qty = 1) => {
    if (qty <= 0) return false;
    const next = { ...get().inventory, [goodId]: (get().inventory[goodId] ?? 0) + qty };
    set({ inventory: next });
    return true;
  },

  removeGoods: (goodId, qty) => {
    if (qty <= 0) return false;
    const inv = get().inventory;
    if ((inv[goodId] ?? 0) < qty) return false;
    const next = { ...inv, [goodId]: (inv[goodId] ?? 0) - qty };
    set({ inventory: next });
    return true;
  },

  reset: () => {
    set({ inventory: { ...DEFAULT_GOODS } });
  },
}));
