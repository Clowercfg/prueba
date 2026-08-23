import { useCropStore } from '../stores/cropStore'

/**
 * Sistema de cultivos migrado del proyecto anterior (systems/economy/CropSystem).
 * La versión original era un componente React con un setInterval de 1 s que
 * llamaba cropStore.tick() salvo que worldStore.paused estuviera activo.
 * Aquí se conserva la lógica pura: misma cadencia de 1 s y mismo gate de pausa,
 * sin dependencias de React ni del worldStore pendiente de migrar.
 */

/** Gate de pausa (equivalente a worldStore.paused del proyecto anterior). */
let paused = false

export function setCropSystemPaused(value: boolean): void {
  paused = value
}

export function isCropSystemPaused(): boolean {
  return paused
}

/** Un tick del sistema: marca como listos los cultivos que cumplieron growthHours. */
export function tickCropSystem(): void {
  if (paused) return
  useCropStore.getState().tick()
}

/**
 * Arranca el ciclo de crecimiento (intervalo de 1 s, igual que el original).
 * Devuelve la función de parada para el cleanup del montaje.
 */
export function startCropSystem(intervalMs = 1000): () => void {
  const iv = setInterval(tickCropSystem, intervalMs)
  return () => clearInterval(iv)
}
