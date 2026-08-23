import { create } from 'zustand'

export type GameStatus = 'running' | 'stopped'

/** Parcelas jugables (pads del layout). */
export type PlotId = 'plotA' | 'plotB' | 'plotC' | 'plotD'
export const PLOT_KEYS: PlotId[] = ['plotA', 'plotB', 'plotC', 'plotD']

/**
 * Selección actual del jugador. Estructural (sin depender del renderer):
 * el composer la recibe como objeto plano para pintar el highlight.
 */
export type Selection =
  | { kind: 'plot'; id: PlotId }
  | { kind: 'animal'; id: string }
  | { kind: 'building'; id: string }
  | null

interface GameState {
  status: GameStatus
  /** FPS medido, actualizado como máximo ~2 veces/seg para no re-renderizar React cada frame. */
  fps: number
  /** Info de cámara/terreno para el HUD (misma cadencia que fps). */
  camZoom: number
  camX: number
  camY: number
  tilesDrawn: number

  selection: Selection

  setStatus: (status: GameStatus) => void
  setFps: (fps: number) => void
  setCamInfo: (info: { zoom: number; x: number; y: number; tilesDrawn: number }) => void
  select: (sel: Selection) => void
}

/**
 * Único puente estado ↔ React UI. La lógica de juego y el renderer leen/escriben
 * aquí solo lo que la UI necesita ver; nada del render depende de React.
 *
 * Los cultivos viven en cropStore (+ CropSystem); el modelo DEMO que vivía
 * aquí fue eliminado al conectar el renderer vía getGrowths → cropStore.
 */
export const useGameStore = create<GameState>((set) => ({
  status: 'stopped',
  fps: 0,
  camZoom: 1,
  camX: 0,
  camY: 0,
  tilesDrawn: 0,
  selection: null,

  setStatus: (status) => set({ status }),
  setFps: (fps) => set({ fps }),
  setCamInfo: ({ zoom, x, y, tilesDrawn }) =>
    set({ camZoom: zoom, camX: x, camY: y, tilesDrawn }),

  select: (selection) => set({ selection }),
}))
