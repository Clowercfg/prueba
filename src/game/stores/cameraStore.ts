import { create } from "zustand";

interface CameraStore {
  target: [number, number, number];
  yaw: number;
  pitch: number;
  distance: number;
  keys: Record<string, boolean>;
  rightDown: boolean;
  rightStart: [number, number] | null;
  setTarget: (t: [number, number, number]) => void;
  nudgeTarget: (dx: number, dz: number) => void;
  setYaw: (y: number) => void;
  setPitch: (p: number) => void;
  setDistance: (d: number) => void;
  setKey: (k: string, down: boolean) => void;
  setRightDown: (d: boolean, x?: number, y?: number) => void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  target: [-10, 0, 14],
  yaw: 0,
  pitch: (47 * Math.PI) / 180,
  distance: 50,
  keys: {},
  rightDown: false,
  rightStart: null,
  setTarget: (t) => set({ target: t }),
  nudgeTarget: (dx, dz) => set((s) => ({ target: [s.target[0] + dx, s.target[1], s.target[2] + dz] })),
  setYaw: (y) => set({ yaw: y }),
  setPitch: (p) => set({ pitch: p }),
  setDistance: (d) => set({ distance: d }),
  setKey: (k, down) => set((s) => ({ keys: { ...s.keys, [k]: down } })),
  setRightDown: (down, x, y) =>
    set((s) => ({
      rightDown: down,
      rightStart: down ? [x ?? 0, y ?? 0] : null,
      ...(down && s.rightStart ? { yaw: s.yaw, pitch: s.pitch } : {}),
    })),
}));
