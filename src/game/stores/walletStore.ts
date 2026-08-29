import { create } from "zustand";
import { api, ApiError } from "../api/client";
import { useAuthStore } from "./authStore";

/**
 * Saldo USDT del wallet del backend (fuente de verdad server-side).
 * - refresh(): GET /api/wallet — se llama al autenticar, al enfocar la app,
 *   al cerrar el modal de depósitos y tras cada débito.
 * - spendUSD(): POST /api/wallet/debit — compra server-authoritative; sin saldo
 *   suficiente el backend rechaza y NO se entrega el producto.
 * No hay créditos client-side: todas las acreditaciones (ventas de productos,
 * cosechas, depósitos, comisiones) pasan por rutas validadas server-side.
 * Sin autenticación (dev sin Telegram) todo es no-op: el juego usa su oro.
 */

interface WalletStore {
  usdtMinor: number;
  refresh: () => Promise<void>;
  /** Débito de compra. Devuelve null si OK, o el mensaje de error. */
  spendUSD: (
    amountMinor: number,
    concept: string,
    meta?: { qty?: number; level?: number; processorLevel?: number }
  ) => Promise<string | null>;
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

  async spendUSD(amountMinor, concept, meta) {
    if (useAuthStore.getState().status !== "authenticated") return "sin sesión";
    try {
      console.log('[spendUSD] POST /wallet/debit', { amountMinor, concept, meta });
      const r = await api.debitWallet(amountMinor, concept, meta);
      console.log('[spendUSD] OK', r);
      set({ usdtMinor: r.availableMinor });
      return null;
    } catch (err) {
      console.error('[spendUSD] ERROR', err);
      if (err instanceof ApiError && typeof err.serverBalance === "number") {
        set({ usdtMinor: err.serverBalance });
      } else {
        void useWalletStore.getState().refresh();
      }
      return err instanceof ApiError ? err.message : "error de compra";
    }
  },
}));
