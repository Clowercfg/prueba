import { create } from "zustand";
import type { AnimalAgent } from "../types/entities";

export const animalRegistry = new Map<number, AnimalAgent>();

interface FarmStore {
  animals: AnimalAgent[];
  registerAnimal: (a: AnimalAgent) => void;
  unregisterAnimal: (id: number) => void;
  clearAnimals: () => void;
}

export const useFarmStore = create<FarmStore>((set) => ({
  animals: [],
  registerAnimal: (a) => {
    animalRegistry.set(a.id, a);
    set((s) => ({ animals: [...s.animals, a] }));
  },
  unregisterAnimal: (id) => {
    animalRegistry.delete(id);
    set((s) => ({ animals: s.animals.filter((a) => a.id !== id) }));
  },
  clearAnimals: () => {
    animalRegistry.clear();
    set({ animals: [] });
  },
}));
