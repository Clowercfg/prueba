import { create } from "zustand";
import { api, ApiError } from "../api/client";
import { useAuthStore } from "./authStore";

/**
 * Saldo USDT del wallet del backend (fuente de verdad server-side).
 * - refresh(): GET /api/wallet — se llama al autenticar, al enfocar la app,
 *   al cerrar el modal de depósitos y tras cada débito/crédito.
 * - spendUSD(): POST /api/wallet/debit — compra server-authoritative; sin saldo
 *   suficiente el backend rechaza y NO se entrega el producto.
 * - earnUSD(): POST /api/wallet/credit — acredita USDT por ventas del juego.
 * Sin autenticación (dev sin Telegram) todo es no-op: el juego usa su oro.
 */

interface WalletStore {
  usdtMinor: number;
  refresh: () => Promise<void>;
  /** Débito de compra. Devuelve null si OK, o el mensaje de error. */
  spendUSD: (amountMinor: number, concept: string) => Promise<string | null>;
  /** Crédito por venta/producción. Devuelve null si OK, o el mensaje de error. */
  earnUSD: (amountMinor: number, concept: string) => Promise<string | null>;
}

export const useWalletStore = create<WalletStore>((set) => ({
  usdtMinor: 0,

  async refresh() {
    if (useAuthStore.getState().status !== "authenticated") return;
    try {
      const data = await api.wallet();
      const usd = data.wallets.find((w) => w.currency === "USD");
      set({ usdtMinor: usd?.availableMinor ?? 0 });
    } catch {
      /* sin backend: se conserva el último valor conocido */
    }
  },

  async spendUSD(amountMinor, concept) {
    if (useAuthStore.getState().status !== "authenticated") return "sin sesión";
    try {
      const r = await api.debitWallet(amountMinor, concept);
      set({ usdtMinor: r.availableMinor });
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "error de compra";
    }
  },

  async earnUSD(amountMinor, concept) {
    if (useAuthStore.getState().status !== "authenticated") return null;
    try {
      const r = await api.creditWallet(amountMinor, concept);
      set({ usdtMinor: r.availableMinor });
      return null;
    } catch {
      return null;
    }
  },
}));
