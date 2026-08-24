import { animalRegistry } from '../stores/farmStore'
import { useEconomyStore } from '../stores/economyStore'
import { useGoodsStore } from '../stores/goodsStore'
import { PRODUCTION_PRICE } from '../config/economyConfig'

/**
 * Sistema económico migrado del proyecto anterior
 * (systems/economy/EconomySystem.tsx).
 * La versión original era un componente React con un setInterval de 4 s que
 * recogía la producción pendiente de los animales: las aves depositan huevos
 * en goodsStore y el resto genera ingreso según PRODUCTION_PRICE.
 * Misma cadencia y mismo gate de pausa, sin dependencias de React ni del
 * worldStore pendiente de migrar.
 */

const EGG_PRODUCERS = new Set(['chicken', 'rooster'])

/** Gate de pausa (equivalente a worldStore.paused del proyecto anterior). */
let paused = false

export function setEconomyPaused(value: boolean): void {
  paused = value
}

export function isEconomyPaused(): boolean {
  return paused
}

/** Recoge la producción pendiente de todos los animales registrados. */
export function collectProduction(): void {
  if (paused) return
  const eco = useEconomyStore.getState()
  const goods = useGoodsStore.getState()
  let income = 0
  for (const a of animalRegistry.values()) {
    if (a.pendingProduction > 0) {
      if (EGG_PRODUCERS.has(a.kind)) {
        // Las aves entregan huevos ENTEROS: la fracción (<1) se retiene en
        // pendingProduction hasta acumular 1. Resetearla aquí perdía esa
        // producción con cada ciclo del collector (intervalos < periodo).
        const delivered = Math.floor(a.pendingProduction)
        if (delivered > 0) {
          goods.addGoods('eggs', delivered)
          a.pendingProduction -= delivered
        }
      } else {
        income += a.pendingProduction * PRODUCTION_PRICE[a.kind as keyof typeof PRODUCTION_PRICE]
        a.pendingProduction = 0
      }
    }
  }
  if (income > 0) eco.addGold(income, 'producción')
}

/**
 * Arranca el ciclo de recolección (intervalo de 4 s, igual que el original).
 * Devuelve la función de parada para el cleanup del montaje.
 */
export function startEconomySystem(intervalMs = 4000): () => void {
  const iv = setInterval(collectProduction, intervalMs)
  return () => clearInterval(iv)
}
