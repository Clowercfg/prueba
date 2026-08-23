import { create } from 'zustand'

export type GameStatus = 'running' | 'stopped'

/** Parcelas jugables (pads del layout). */
export type PlotId = 'plotA' | 'plotB' | 'plotC' | 'plotD'
export const PLOT_KEYS: PlotId[] = ['plotA', 'plotB', 'plotC', 'plotD']

/** Crecimiento a partir del cual el cultivo puede cosecharse. */
export const READY_AT = 0.92
/** Segundos de crecimiento desde plantar hasta listo. */
const GROW_SECONDS = 10

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

  /** Crecimiento visible por parcela (cuantizado a 1/20 → rebakes baratos). */
  crops: Record<PlotId, number>
  /** Se incrementa SOLO cuando cambia el valor visible de algún cultivo. */
  cropsVersion: number
  selection: Selection

  setStatus: (status: GameStatus) => void
  setFps: (fps: number) => void
  setCamInfo: (info: { zoom: number; x: number; y: number; tilesDrawn: number }) => void
  /** Tap en parcela vacía. false si no estaba vacía. */
  plantSeed: (id: PlotId) => boolean
  /** Tap en cultivo listo. false si aún no está listo. */
  harvest: (id: PlotId) => boolean
  select: (sel: Selection) => void
  /** Avanza el crecimiento (llamar 1 vez por frame con dt en segundos). */
  tickCrops: (dt: number) => void
}

// Crecimiento preciso (no reactivo): el store sólo publica el valor
// cuantizado que la vista necesita, para rebakear la banda de tierra pocas veces.
const precise: Record<PlotId, number> = {
  plotA: 0.04,
  plotB: 0.27,
  plotC: 0.58,
  plotD: 0.93,
}
const quantize = (g: number): number => Math.round(g * 20) / 20

const initialCrops = (): Record<PlotId, number> => ({
  plotA: quantize(precise.plotA),
  plotB: quantize(precise.plotB),
  plotC: quantize(precise.plotC),
  plotD: quantize(precise.plotD),
})

/**
 * Único puente estado ↔ React UI. La lógica de juego y el renderer leen/escriben
 * aquí solo lo que la UI necesita ver; nada del render depende de React.
 */
export const useGameStore = create<GameState>((set, get) => ({
  status: 'stopped',
  fps: 0,
  camZoom: 1,
  camX: 0,
  camY: 0,
  tilesDrawn: 0,
  crops: initialCrops(),
  cropsVersion: 0,
  selection: null,

  setStatus: (status) => set({ status }),
  setFps: (fps) => set({ fps }),
  setCamInfo: ({ zoom, x, y, tilesDrawn }) =>
    set({ camZoom: zoom, camX: x, camY: y, tilesDrawn }),

  plantSeed: (id) => {
    if (precise[id] > 0.001) return false
    precise[id] = 0.001
    set({ crops: { ...get().crops, [id]: 0 }, cropsVersion: get().cropsVersion + 1 })
    return true
  },

  harvest: (id) => {
    if (precise[id] < READY_AT) return false
    precise[id] = 0
    set({ crops: { ...get().crops, [id]: 0 }, cropsVersion: get().cropsVersion + 1 })
    return true
  },

  select: (selection) => set({ selection }),

  tickCrops: (dt) => {
    if (!(dt > 0)) return
    let changed = false
    for (const k of PLOT_KEYS) {
      const g = precise[k]
      if (g <= 0 || g >= 1) continue
      const ng = Math.min(1, g + dt / GROW_SECONDS)
      if (quantize(ng) !== quantize(g)) changed = true
      precise[k] = ng
    }
    if (changed) set({ crops: initialCrops(), cropsVersion: get().cropsVersion + 1 })
  },
}))
