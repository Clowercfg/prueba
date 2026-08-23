import { CROP_ECONOMY } from '../config/economyConfig'
import { useCropStore } from '../stores/cropStore'
import { PLOT_KEYS, useGameStore, type PlotId } from '../stores/gameStore'

/**
 * Reglas de interacción de terreno (#20), extraídas de GameCanvas para que
 * las reglas vivan FUERA del componente React. Sólo orquesta acciones
 * EXISTENTES de cropStore (plantCrop/harvestCrop) + selección; no crea
 * economía ni tiempos nuevos.
 */

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
