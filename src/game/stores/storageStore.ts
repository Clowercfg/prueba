import { create } from "zustand";

export interface CrateFocus {
  id: string;
  crateIndex: number;
}

interface StorageStore {
  focus: CrateFocus | null;
  openCrate: (focus: CrateFocus) => void;
  closeCrate: () => void;
}

export const useStorageStore = create<StorageStore>((set) => ({
  focus: null,
  openCrate: (focus) => set({ focus }),
  closeCrate: () => set({ focus: null }),
}));
