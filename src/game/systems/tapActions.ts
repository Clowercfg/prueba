import { CROP_ECONOMY } from '../config/economyConfig'
import { PADS } from '../config/layoutConfig'
import { useCropStore } from '../stores/cropStore'
import { PLOT_KEYS, useGameStore, type PlotId } from '../stores/gameStore'
import { worldToTileIndex } from './isometricProjection'

/**
 * Reglas de interacción (#20), extraídas de GameCanvas para que las reglas
 * vivan FUERA del componente React. Sólo orquesta acciones EXISTENTES de
 * cropStore (plantCrop/harvestCrop) + selección; no crea economía ni tiempos
 * nuevos. El canvas sólo aporta la conversión screen→world (Interaction) y
 * el hit-test de animales (renderer), inyectados como dependencias.
 */

const PLOT_PADS: ReadonlyArray<{ pad: { x0: number; y0: number; x1: number; y1: number } }> = [
  { pad: PADS.plotA },
  { pad: PADS.plotB },
  { pad: PADS.plotC },
  { pad: PADS.plotD },
]

function tileInPad(
  i: number,
  j: number,
  pad: { x0: number; y0: number; x1: number; y1: number },
  inflate = 0,
): boolean {
  return i >= pad.x0 - inflate && i <= pad.x1 + inflate && j >= pad.y0 - inflate && j <= pad.y1 + inflate
}

/** IDs de cultivo en orden de config (fuente de verdad para sembrar). */
const CROP_IDS = Object.keys(CROP_ECONOMY)

/**
 * Siembra en `plotIndex` el primer cultivo con semillas disponibles.
 * Devuelve true si sembró. (La elección explícita de semilla llegará con
 * la UI de selección; hoy se usa la primera disponible.)
 */
export function plantFirstAvailable(plotIndex: number): boolean {
  const crop = useCropStore.getState()
  for (const cropId of CROP_IDS) {
    const inv = crop.inventory[cropId]
    if ((inv?.seeds ?? 0) >= 1 && crop.plantCrop(cropId, plotIndex)) return true
  }
  return false
}

const plotIdOf = (index: number): PlotId | null => PLOT_KEYS[index] ?? null

/**
 * Resuelve un tap sobre una parcela contra el estado REAL:
 *   lista → cosechar (+ seleccionar) · creciendo → seleccionar ·
 *   vacía → sembrar primer cultivo con semillas.
 */
export function tapPlot(index: number): void {
  const store = useCropStore.getState()
  const planted = store.planted.find((p) => p.plotIndex === index)
  const selectPlot = (): void => {
    const id = plotIdOf(index)
    if (id) useGameStore.getState().select({ kind: 'plot', id })
  }

  if (!planted) {
    plantFirstAvailable(index)
    selectPlot()
    return
  }
  if (planted.state === 'ready') {
    store.harvestCrop(planted.id)
  }
  selectPlot()
}

/** Dependencias del canvas que la capa pura no debe conocer directamente. */
export interface FarmTapDeps {
  /** Hit-test de animales del renderer (targets táctiles de AnimalLayer). */
  pickAnimal: (wx: number, wy: number) => string | null
}

/**
 * Resuelve un tap de mundo contra las reglas del juego (#20):
 *   parcela → tapPlot (sembrar/cosechar/seleccionar con estado REAL de
 *   cropStore) · animal/edificio → seleccionar · resto → deseleccionar.
 */
export function handleFarmTap(deps: FarmTapDeps, wx: number, wy: number): void {
  const store = useGameStore.getState()
  const { i, j } = worldToTileIndex(wx, wy)

  for (let index = 0; index < PLOT_KEYS.length; index++) {
    if (tileInPad(i, j, PLOT_PADS[index].pad)) {
      tapPlot(index)
      return
    }
  }

  const animalId = deps.pickAnimal(wx, wy)
  if (animalId) {
    store.select({ kind: 'animal', id: animalId })
    return
  }

  // Edificios: rectángulo del pad con un pequeño margen táctil.
  if (tileInPad(i, j, PADS.barn, 0.6)) {
    store.select({ kind: 'building', id: 'barn' })
    return
  }
  if (tileInPad(i, j, PADS.house, 0.6)) {
    store.select({ kind: 'building', id: 'house' })
    return
  }
  if (tileInPad(i, j, PADS.pen, 0.4)) {
    store.select({ kind: 'building', id: 'pen' })
    return
  }

  store.select(null)
}
