import { useProcessingStore } from '../stores/processingStore'

/**
 * Sistema de procesamiento migrado del proyecto anterior
 * (systems/processing/ProcessingSystem.tsx).
 * La versión original era un componente React con un setInterval de 1 s que
 * llamaba processingStore.tick() salvo que worldStore.paused estuviera activo.
 * Misma cadencia y mismo gate de pausa, sin dependencias de React ni del
 * worldStore pendiente de migrar.
 */

/** Gate de pausa (equivalente a worldStore.paused del proyecto anterior). */
let paused = false

export function setProcessingPaused(value: boolean): void {
  paused = value
}

export function isProcessingPaused(): boolean {
  return paused
}

/** Un tick del sistema: entrega los productos de los trabajos completados. */
export function tickProcessingSystem(): void {
  if (paused) return
  useProcessingStore.getState().tick()
}

/**
 * Arranca el ciclo de procesamiento (intervalo de 1 s, igual que el original).
 * Devuelve la función de parada para el cleanup del montaje.
 */
export function startProcessingSystem(intervalMs = 1000): () => void {
  const iv = setInterval(tickProcessingSystem, intervalMs)
  return () => clearInterval(iv)
}
