import { animalRegistry } from '../stores/farmStore'
import { useGoodsStore } from '../stores/goodsStore'
import { useCropStore } from '../stores/cropStore'
import { useAuthStore } from '../stores/authStore'

/**
 * Sistema económico de animales: recoge la producción pendiente de todos los
 * animales y la deposita como PRODUCTOS en el almacén (goodsStore).
 * NUNCA acredita USDT automáticamente: el jugador vende los productos en el
 * almacén (goodsStore.sellGoods) y ahí el SERVIDOR valida stock y precio.
 */

/** Mapea cada especie al producto de su categoría en goodsStore. */
const GOOD_BY_ANIMAL: Record<string, string> = {
  chicken: 'eggs',
  rooster: 'eggs',
  cow: 'milk',
  pig: 'meat',
}

/** Gate de pausa (equivalente a worldStore.paused del proyecto anterior). */
let paused = false

export function setEconomyPaused(value: boolean): void {
  paused = value
}

export function isEconomyPaused(): boolean {
  return paused
}

/** Recoge la producción pendiente de todos los animales registrados. */
export async function collectProduction(): Promise<void> {
  if (paused) return
  const goods = useGoodsStore.getState()
  for (const a of animalRegistry.values()) {
    if (a.pendingProduction > 0) {
      // Se entregan unidades ENTERAS: la fracción (<1) se retiene en
      // pendingProduction hasta acumular 1 unidad.
      const delivered = Math.floor(a.pendingProduction)
      if (delivered > 0) {
        const goodId = GOOD_BY_ANIMAL[a.kind]
        // El servidor valida contra su propio contador de animales y el tiempo
        // transcurrido: devuelve lo realmente acreditado (puede ser < entregado).
        const credited = await goods.addGoods(goodId, delivered, { via: 'animal', kind: a.kind })
        if (credited > 0) a.pendingProduction -= credited
      }
    }
  }
}

let authUnsub: (() => void) | null = null
let syncedThisSession = false

/**
 * Arranca el ciclo de recolección (intervalo de 4 s, igual que el original)
 * y, al autenticarse, sincroniza el inventario con el backend (import una vez
 * + GET autoritativo). Devuelve la función de parada para el cleanup del montaje.
 */
export function startEconomySystem(intervalMs = 4000): () => void {
  const iv = setInterval(() => {
    void collectProduction()
  }, intervalMs)

  if (!authUnsub) {
    authUnsub = useAuthStore.subscribe((s) => {
      if (s.status === 'authenticated' && !syncedThisSession) {
        syncedThisSession = true
        void useGoodsStore.getState().syncServer()
        void useCropStore.getState().syncCropsServer()
      }
    })
  }

  return () => {
    clearInterval(iv)
    if (authUnsub) {
      authUnsub()
      authUnsub = null
    }
  }
}