/**
 * Espejo server-side de la economia de compras (animales, combos, mejoras).
 *
 * POST /api/wallet/debit valida que el importe enviado por el cliente coincida
 * EXACTAMENTE con lo que el servidor calcula desde aqui. Las aritmeticas se
 * replican en el mismo orden y con los mismos doubles que el cliente para que
 * el redondeo sea identico (0.2 * qty no es lo mismo en float que en minor).
 *
 * Mantener en sincronia con:
 *  - src/game/config/economyConfig.ts   (ANIMAL_ECONOMY, CROP_ECONOMY)
 *  - src/game/config/offersConfig.ts    (OFFERS, MAX_DISCOUNT)
 *  - src/game/config/upgradesConfig.ts  (UPGRADES_ECONOMY, getProcessorLevelDef)
 */

/** Precios de animales en dolares (espejo de ANIMAL_ECONOMY). */
export const ANIMAL_PRICE_DOLLARS: Record<string, number> = {
  chicken: 10,
  rooster: 35,
  cow: 50,
  pig: 30,
}

/** Precio de semillas en dolares (espejo de CROP_ECONOMY.seedPrice). */
export const SEED_PRICE_DOLLARS: Record<string, number> = {
  wheat: 0.2,
  carrot: 0.2,
  corn: 0.3,
  potato: 0.4,
}

/** Descuento maximo permitido en combos (espejo de MAX_DISCOUNT). */
export const MAX_DISCOUNT = 0.1

interface OfferServerItem {
  type: 'seed' | 'animal'
  cropId?: string
  kind?: string
  qty: number
}

/** Combos (espejo de OFFERS) en el mismo orden de items que el cliente. */
const OFFERS: Record<string, { items: OfferServerItem[] }> = {
  seedpack: {
    items: [
      { type: 'seed', cropId: 'wheat', qty: 100 },
      { type: 'seed', cropId: 'corn', qty: 100 },
      { type: 'seed', cropId: 'carrot', qty: 100 },
      { type: 'seed', cropId: 'potato', qty: 100 },
    ],
  },
  beginner: {
    items: [
      { type: 'seed', cropId: 'wheat', qty: 20 },
      { type: 'seed', cropId: 'carrot', qty: 10 },
      { type: 'animal', kind: 'chicken', qty: 2 },
    ],
  },
  farmer: {
    items: [
      { type: 'seed', cropId: 'wheat', qty: 30 },
      { type: 'seed', cropId: 'carrot', qty: 20 },
      { type: 'seed', cropId: 'potato', qty: 10 },
      { type: 'animal', kind: 'cow', qty: 1 },
    ],
  },
  poultry: {
    items: [
      { type: 'animal', kind: 'chicken', qty: 5 },
      { type: 'animal', kind: 'rooster', qty: 2 },
      { type: 'seed', cropId: 'wheat', qty: 20 },
    ],
  },
  dairy: {
    items: [
      { type: 'animal', kind: 'cow', qty: 3 },
      { type: 'seed', cropId: 'carrot', qty: 20 },
    ],
  },
  swine: {
    items: [
      { type: 'animal', kind: 'pig', qty: 4 },
      { type: 'seed', cropId: 'potato', qty: 10 },
    ],
  },
  repro: {
    items: [
      { type: 'animal', kind: 'rooster', qty: 2 },
      { type: 'animal', kind: 'chicken', qty: 6 },
      { type: 'seed', cropId: 'wheat', qty: 10 },
    ],
  },
  granjero: {
    items: [
      { type: 'seed', cropId: 'wheat', qty: 150 },
      { type: 'seed', cropId: 'carrot', qty: 100 },
      { type: 'seed', cropId: 'potato', qty: 80 },
      { type: 'animal', kind: 'cow', qty: 4 },
      { type: 'animal', kind: 'chicken', qty: 2 },
    ],
  },
  advanced: {
    items: [
      { type: 'animal', kind: 'cow', qty: 5 },
      { type: 'animal', kind: 'chicken', qty: 10 },
      { type: 'animal', kind: 'rooster', qty: 4 },
      { type: 'seed', cropId: 'wheat', qty: 50 },
      { type: 'seed', cropId: 'potato', qty: 50 },
    ],
  },
  mega: {
    items: [
      { type: 'animal', kind: 'cow', qty: 10 },
      { type: 'animal', kind: 'chicken', qty: 20 },
      { type: 'animal', kind: 'rooster', qty: 8 },
      { type: 'animal', kind: 'pig', qty: 6 },
      { type: 'seed', cropId: 'wheat', qty: 100 },
      { type: 'seed', cropId: 'carrot', qty: 100 },
      { type: 'seed', cropId: 'potato', qty: 100 },
    ],
  },
}

/** Replica identica de offerNormalPrice / offerSalePrice (mismos doubles). */
export function offerSalePriceMinor(comboId: string): number | null {
  const offer = OFFERS[comboId]
  if (!offer) return null
  let normal = 0
  for (const it of offer.items) {
    if (it.type === 'seed' && it.cropId) normal += (SEED_PRICE_DOLLARS[it.cropId] ?? 0) * it.qty
    if (it.type === 'animal' && it.kind) normal += (ANIMAL_PRICE_DOLLARS[it.kind] ?? 0) * it.qty
  }
  return Math.round(normal * (1 - MAX_DISCOUNT) * 100)
}

/** Precios por nivel de cada edificio, en dolares (espejo de UPGRADES_ECONOMY). */
const UPGRADE_PRICE_DOLLARS: Record<string, Record<number, number>> = {
  coop: { 1: 0, 2: 8, 3: 18, 4: 40, 5: 75, 6: 130, 7: 250, 8: 400 },
  stable: { 1: 0, 2: 15, 3: 40, 4: 90, 5: 180, 6: 350, 7: 600 },
  pigPen: { 1: 0, 2: 10, 3: 30, 4: 75, 5: 180, 6: 400, 7: 850 },
  incubator: { 1: 0, 2: 10, 3: 30, 4: 75, 5: 200 },
  granary: { 1: 0, 2: 5, 3: 12, 4: 30, 5: 75, 6: 180, 7: 400, 8: 900 },
  processing: { 1: 5, 2: 10, 3: 20, 4: 35, 5: 60 },
}

/** Mejoras especiales, en dolares (espejo de los specials de UPGRADES_ECONOMY). */
const SPECIAL_PRICE_DOLLARS: Record<string, number> = {
  'stable-speed': 60,
  'pig-engorde-1': 75,
  'pig-engorde-2': 200,
}

/** Coste por huevo de la Procesadora, en dolares (espejo de costPerEgg). */
const PROCESSOR_COST_PER_EGG_DOLLARS: Record<number, number> = {
  1: 0.01,
  2: 0.009,
  3: 0.008,
  4: 0.007,
  5: 0.006,
}

/** Devuelve un entero positivo dentro de [min, max] o null si no es valido. */
function intOpt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return null
  return v
}

/**
 * Calcula el importe (minor) que el servidor espera para un concept de compra.
 * Devuelve null si el concept o sus parametros no son reconocidos.
 * Replica EXACTAMENTE la aritmetica del cliente para que el redondeo coincida.
 */
export function expectedDebitMinor(
  concept: string,
  body: { qty?: unknown; level?: unknown; processorLevel?: unknown },
): number | null {
  const colIdx = concept.indexOf(':')
  const prefix = colIdx === -1 ? concept : concept.slice(0, colIdx)
  const param = colIdx === -1 ? '' : concept.slice(colIdx + 1)

  switch (prefix) {
    case 'animal': {
      const p = ANIMAL_PRICE_DOLLARS[param]
      if (p == null) return null
      const qty = intOpt(body.qty, 1, 10_000)
      if (qty == null) return null
      return Math.round(p * qty * 100)
    }
    case 'combo':
      return offerSalePriceMinor(param)
    case 'upgrade': {
      const p = UPGRADE_PRICE_DOLLARS[param]?.[intOpt(body.level, 1, 99) as number]
      if (p == null) return null
      return Math.round(p * 100)
    }
    case 'special': {
      const p = SPECIAL_PRICE_DOLLARS[param]
      if (p == null) return null
      return Math.round(p * 100)
    }
    case 'processing': {
      const level = intOpt(body.processorLevel, 1, 5)
      const c = level == null ? undefined : PROCESSOR_COST_PER_EGG_DOLLARS[level]
      if (c == null) return null
      const qty = intOpt(body.qty, 1, 10_000)
      if (qty == null) return null
      return Math.round(c * qty * 100)
    }
    case 'processing-add': {
      const level = intOpt(body.processorLevel, 1, 5)
      const c = level == null ? undefined : PROCESSOR_COST_PER_EGG_DOLLARS[level]
      if (c == null) return null
      return Math.round(c * 100)
    }
    default:
      return null
  }
}