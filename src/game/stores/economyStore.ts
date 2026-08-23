import { create } from "zustand";

interface EconomyStore {
  gold: number;
  diamonds: number;
  lastIncomeAt: number;
  totalIncome: number;
  totalExpenses: number;
  addGold: (amount: number, note?: string) => void;
  spendGold: (amount: number) => boolean;
  setGold: (g: number) => void;
  addDiamonds: (amount: number) => void;
  spendDiamonds: (amount: number) => boolean;
}

export const useEconomyStore = create<EconomyStore>((set, get) => ({
  gold: 2500,
  diamonds: 25,
  lastIncomeAt: Date.now(),
  totalIncome: 0,
  totalExpenses: 0,
  addGold: (amount) =>
    set((s) => ({ gold: s.gold + amount, totalIncome: s.totalIncome + Math.max(0, amount) })),
  spendGold: (amount) => {
    if (get().gold < amount) return false;
    set((s) => ({ gold: s.gold - amount, totalExpenses: s.totalExpenses + amount }));
    return true;
  },
  setGold: (g) => set({ gold: g }),
  addDiamonds: (amount) => set((s) => ({ diamonds: s.diamonds + amount })),
  spendDiamonds: (amount) => {
    if (get().diamonds < amount) return false;
    set((s) => ({ diamonds: s.diamonds - amount }));
    return true;
  },
}));
