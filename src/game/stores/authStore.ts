import { create } from "zustand";
import { api, ApiError, getAuthHeaders, type MeResponse } from "../api/client";

/**
 * Estado de autenticación de Telegram (única fuente para toda la UI).
 *
 * El juego NUNCA espera a signIn(): el Canvas2D se monta en paralelo y este
 * store solo informa. Estados:
 *   loading         → consulta /api/me en curso (no bloquea el render)
 *   authenticated   → backend validó initData y resolvió/creó el usuario
 *   unauthenticated → no hay credenciales (p.ej. navegador normal sin Telegram)
 *   error           → credenciales presentes pero rechazadas, o red/backend caído
 */

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthState {
  status: AuthStatus;
  me: MeResponse | null;
  error: string | null;
  /** Valida initData contra el backend y resuelve el usuario actual. */
  signIn: () => Promise<void>;
}

function hasCredentials(): boolean {
  return Object.keys(getAuthHeaders()).length > 0;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  me: null,
  error: null,

  async signIn() {
    set({ status: "loading", me: null, error: null });
    try {
      const me = await api.me();
      set({ status: "authenticated", me });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && !hasCredentials()) {
        // Sin Telegram y sin usuario de desarrollo: estado normal fuera de la Mini App.
        set({ status: "unauthenticated", me: null, error: null });
      } else if (err instanceof ApiError && err.status === 401) {
        // Había credenciales (initData/dev-user) y el backend las rechazó.
        set({ status: "error", me: null, error: err.message });
      } else {
        const message = err instanceof Error ? err.message : "network_error";
        set({ status: "error", me: null, error: message });
      }
    }
  },
}));
