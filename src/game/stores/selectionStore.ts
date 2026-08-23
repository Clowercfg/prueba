import { create } from "zustand";
import type { SelectedEntity } from "../types/entities";

interface SelectionStore {
  selected: SelectedEntity | null;
  hovered: SelectedEntity | null;
  select: (e: SelectedEntity | null) => void;
  setHover: (e: SelectedEntity | null) => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  selected: null,
  hovered: null,
  select: (e) => set({ selected: e }),
  setHover: (e) => set({ hovered: e }),
}));
