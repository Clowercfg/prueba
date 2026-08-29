import { create } from "zustand";

export type GameSectionId =
  | "farm"
  | "animals"
  | "crops"
  | "processing"
  | "infrastructure"
  | "inventory"
  | "upgrades"
  | "more"
  | "calendar"
  | "language"
  | "profile"
  | "withdrawals";

interface UiStore {
  section: GameSectionId | null;
  storeOpen: boolean;
  /** Modal global de depósitos (accesible desde TopNav y Tienda). */
  depositOpen: boolean;
  openSection: (id: GameSectionId) => void;
  toggleSection: (id: GameSectionId) => void;
  closeSection: () => void;
  openStore: () => void;
  toggleStore: () => void;
  closeStore: () => void;
  openDeposits: () => void;
  closeDeposits: () => void;
  /** Cierra paneles laterales y la tienda (clic en la zona verde / Esc). */
  closeOverlays: () => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  section: null,
  storeOpen: false,
  depositOpen: false,
  openSection: (id) => set({ section: id, storeOpen: false }),
  toggleSection: (id) => set((s) => ({ section: s.section === id ? null : id, storeOpen: false })),
  closeSection: () => set({ section: null }),
  openStore: () => set({ storeOpen: true, section: null }),
  toggleStore: () => {
    const s = get();
    if (s.storeOpen) s.closeStore();
    else s.openStore();
  },
  closeStore: () => set({ storeOpen: false }),
  openDeposits: () => set({ depositOpen: true, section: null, storeOpen: false }),
  closeDeposits: () => set({ depositOpen: false }),
  closeOverlays: () => set({ section: null, storeOpen: false, depositOpen: false }),
}));
