import { create } from 'zustand'

export type GameStatus = 'running' | 'stopped'

interface GameState {
  status: GameStatus
  /** FPS medido, actualizado como máximo ~2 veces/seg para no re-renderizar React cada frame. */
  fps: number
  /** Info de cámara/terreno para el HUD (misma cadencia que fps). */
  camZoom: number
  camX: number
  camY: number
  tilesDrawn: number
  setStatus: (status: GameStatus) => void
  setFps: (fps: number) => void
  setCamInfo: (info: { zoom: number; x: number; y: number; tilesDrawn: number }) => void
}

/**
 * Único puente estado ↔ React UI. La lógica de juego y el renderer leen/escriben
 * aquí solo lo que la UI necesita ver; nada del render depende de React.
 */
export const useGameStore = create<GameState>((set) => ({
  status: 'stopped',
  fps: 0,
  camZoom: 1,
  camX: 0,
  camY: 0,
  tilesDrawn: 0,
  setStatus: (status) => set({ status }),
  setFps: (fps) => set({ fps }),
  setCamInfo: ({ zoom, x, y, tilesDrawn }) => set({ camZoom: zoom, camX: x, camY: y, tilesDrawn }),
}))
