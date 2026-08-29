/**
 * Cosechas del jugador (inventario + parcelas autoritativas en D1).
 *
 * Misma filosofia que /api/goods: semillas y cosechas viven en el servidor.
 * - /purchase: compra de semillas (debito + alta de semillas ATOMICO).
 * - /plant: consume semillas server-side y crea la parcela con ready_at
 *   calculado por el servidor (tiempo real, sin upgrades → duracion fija).
 * - /harvest: valida que el cultivo este listo y acredita la cosecha.
 * - /sell: descuenta cosecha de forma atomica y acredita USDT al PRECIO DEL
 *   SERVIDOR via ledger (nunca se confia en el monto del cliente).
 * Cierra el money-printer de POST /api/wallet/credit para cosechas.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv, Env } from '../env'
import { HttpError } from '../auth'
import { requireAuth, rateLimit } from '../middleware'
import { creditSale, debitPurchase } from '../services/ledger'

/** Economia de cultivos (espejo server-side de CROP_ECONOMY). */
const CROP_ECONOMY: Record<string, { seedPrice: number; growthHours: number; sellPrice: number }> = {
  wheat: { seedPrice: 0.2, growthHours: 24, sellPrice: 0.204 },
  carrot: { seedPrice: 0.2, growthHours: 48, sellPrice: 0.2049 },
  corn: { seedPrice: 0.3, growthHours: 36, sellPrice: 0.305 },
  potato: { seedPrice: 0.4, growthHours: 48, sellPrice: 0.41 },
}

const LEGACY_CROP_CAP = 9999
const LEGACY_PLOT_CAP = 64
const PLANT_MAX_QTY = 1000
const PLOT_INDEX_MAX = 63
const SELL_MAX_QTY = 100_000
const MINUTE = 60

const crops = new Hono<AppEnv>()
crops.use('*', requireAuth)

type CropStats = { seeds: number; harvest: number }
type PlotRow = { plotIndex: number; cropId: string; quantity: number; plantedAt: number; readyAt: number }

async function getCropInventory(env: Env, userId: number): Promise<Record<string, CropStats>> {
  const rows = await env.DB.prepare(
    `SELECT crop_id AS cropId, seeds, harvest FROM player_crops WHERE user_id = ?1 AND (seeds > 0 OR harvest > 0)`,
  )
    .bind(userId)
    .all<{ cropId: string; seeds: number; harvest: number }>()
  const out: Record<string, CropStats> = {}
  for (const r of rows.results ?? []) out[r.cropId] = { seeds: r.seeds, harvest: r.harvest }
  return out
}

async function getPlots(env: Env, userId: number): Promise<PlotRow[]> {
  const rows = await env.DB.prepare(
    `SELECT plot_index AS plotIndex, crop_id AS cropId, quantity, planted_at AS plantedAt, ready_at AS readyAt
       FROM player_crop_plots WHERE user_id = ?1 ORDER BY plot_index`,
  )
    .bind(userId)
    .all<{ plotIndex: number; cropId: string; quantity: number; plantedAt: number; readyAt: number }>()
  return (rows.results ?? []).map((r) => ({ ...r, plotIndex: Number(r.plotIndex) }))
}

/** Cuenta creada antes del despliegue de 0005 (puede importar su estado local). */
async function isLegacyAccount(env: Env, userId: number): Promise<boolean> {
  const m = await env.DB.prepare(
    `SELECT applied_at FROM d1_migrations WHERE name LIKE '0005%' ORDER BY applied_at DESC LIMIT 1`,
  )
    .first<{ applied_at: unknown }>()
  const raw = m?.applied_at
  let cut = Number.NaN
  if (typeof raw === 'number') {
    cut = raw
  } else if (typeof raw === 'string') {
    const iso = raw.replace(' ', 'T')
    const withTz = /[+-]\d\d:\d\d$/.test(iso) || iso.endsWith('Z') ? iso : `${iso}Z`
    cut = Date.parse(withTz)
  }
  if (Number.isNaN(cut)) return true
  const u = await env.DB.prepare(`SELECT created_at AS created FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ created: number }>()
  return (u?.created ?? cut) < cut
}

function sanitizeCropInventory(entries: unknown): Record<string, CropStats> {
  const out: Record<string, CropStats> = {}
  if (!entries || typeof entries !== 'object') return out
  for (const [id, v] of Object.entries(entries as Record<string, unknown>)) {
    if (!(id in CROP_ECONOMY)) continue
    const o = (v ?? {}) as { seeds?: unknown; harvest?: unknown }
    const seeds = typeof o.seeds === 'number' && Number.isInteger(o.seeds) ? o.seeds : 0
    const harvest = typeof o.harvest === 'number' && Number.isInteger(o.harvest) ? o.harvest : 0
    if (seeds < 0 || harvest < 0 || seeds > LEGACY_CROP_CAP || harvest > LEGACY_CROP_CAP) continue
    if (seeds === 0 && harvest === 0) continue
    out[id] = { seeds, harvest }
  }
  return out
}

function sanitizePlots(entries: unknown, now: number): PlotRow[] {
  const out: PlotRow[] = []
  if (!Array.isArray(entries)) return out
  const seen = new Set<number>()
  for (const p of entries) {
    if (out.length >= LEGACY_PLOT_CAP) break
    const o = (p ?? {}) as { plotIndex?: unknown; cropId?: unknown; quantity?: unknown; plantedAt?: unknown }
    if (typeof o.plotIndex !== 'number' || !Number.isInteger(o.plotIndex)) continue
    if (o.plotIndex < 0 || o.plotIndex > PLOT_INDEX_MAX || seen.has(o.plotIndex)) continue
    if (typeof o.cropId !== 'string' || !(o.cropId in CROP_ECONOMY)) continue
    const quantity = typeof o.quantity === 'number' && Number.isInteger(o.quantity) ? o.quantity : 0
    const plantedAt = typeof o.plantedAt === 'number' && Number.isInteger(o.plantedAt) ? o.plantedAt : now
    if (quantity <= 0 || quantity > LEGACY_CROP_CAP) continue
    if (plantedAt > now) continue
    const def = CROP_ECONOMY[o.cropId]
    seen.add(o.plotIndex)
    out.push({ plotIndex: o.plotIndex, cropId: o.cropId, quantity, plantedAt, readyAt: plantedAt + def.growthHours * 3600 * 1000 })
  }
  return out
}

/** GET /api/crops — inventario + parcelas autoritativas. */
crops.get('/', async (c) => {
  const user = c.get('user')
  return c.json({ crops: await getCropInventory(c.env, user.id), plots: await getPlots(c.env, user.id) })
})

/** POST /api/crops/init — import LOCAL persistido (unica vez por cuenta). */
crops.post('/init', rateLimit('crops-init', 10, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const existed = await c.env.DB.prepare(`SELECT 1 AS x FROM player_crops WHERE user_id = ?1 LIMIT 1`)
    .bind(user.id)
    .first()
  if (existed) return c.json({ ok: true, initialized: true, ...(await describe(c)) })

  const legacy = await isLegacyAccount(c.env, user.id)
  const now = Date.now()
  const snapshot = legacy
    ? sanitizeCropInventory((body as { crops?: unknown })?.crops)
    : {}
  const plots = legacy ? sanitizePlots((body as { plots?: unknown })?.plots, now) : []
  const stmts = [
    ...Object.entries(snapshot).map(([id, s]) =>
      c.env.DB.prepare(
        `INSERT INTO player_crops (user_id, crop_id, seeds, harvest, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(user.id, id, s.seeds, s.harvest, now),
    ),
    ...plots.map((p) =>
      c.env.DB.prepare(
        `INSERT INTO player_crop_plots (user_id, plot_index, crop_id, quantity, planted_at, ready_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      ).bind(user.id, p.plotIndex, p.cropId, p.quantity, p.plantedAt, p.readyAt, now),
    ),
  ]
  if (stmts.length > 0) await c.env.DB.batch(stmts)
  return c.json({ ok: true, initialized: true, ...(await describe(c)) })
})

async function describe(c: Context<AppEnv>): Promise<{ crops: Record<string, CropStats>; plots: PlotRow[] }> {
  const user = c.get('user')
  return { crops: await getCropInventory(c.env, user.id), plots: await getPlots(c.env, user.id) }
}

/** POST /api/crops/purchase — comprar semillas (debito + alta ATOMICO). */
crops.post('/purchase', rateLimit('crops-purchase', 30, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { cropId } = body as { cropId?: unknown }
  if (typeof cropId !== 'string' || !(cropId in CROP_ECONOMY)) throw new HttpError(400, 'cultivo invalido')
  const qty = parseIntIn((body as { qty?: unknown })?.qty, SELL_MAX_QTY, 'qty')
  const def = CROP_ECONOMY[cropId]
  const amountMinor = Math.round(def.seedPrice * 100) * qty

  try {
    await debitPurchase(c.env, { userId: user.id, amountMinor, sourceId: Date.now() })
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) {
      throw new HttpError(400, 'Saldo disponible insuficiente')
    }
    throw e
  }
  await c.env.DB.prepare(
    `INSERT INTO player_crops (user_id, crop_id, seeds, harvest, updated_at) VALUES (?1, ?2, ?3, 0, ?4)
     ON CONFLICT(user_id, crop_id) DO UPDATE SET seeds = seeds + excluded.seeds, updated_at = excluded.updated_at`,
  )
    .bind(user.id, cropId, qty, Date.now())
    .run()
  const w = await c.env.DB.prepare(
    `SELECT available_minor AS availableMinor FROM wallets WHERE user_id = ?1 AND currency = 'USD'`,
  )
    .bind(user.id)
    .first<{ availableMinor: number }>()
  return c.json({ ok: true, availableMinor: w?.availableMinor ?? 0, crops: await getCropInventory(c.env, user.id) })
})

/** POST /api/crops/seeds — alta de semillas por bundle/combos (pago global previo). */
crops.post('/seeds', rateLimit('crops-grant', 10, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { cropId } = body as { cropId?: unknown }
  if (typeof cropId !== 'string' || !(cropId in CROP_ECONOMY)) throw new HttpError(400, 'cultivo invalido')
  const qty = parseIntIn((body as { qty?: unknown })?.qty, 1000, 'qty')
  await c.env.DB.prepare(
    `INSERT INTO player_crops (user_id, crop_id, seeds, harvest, updated_at) VALUES (?1, ?2, ?3, 0, ?4)
     ON CONFLICT(user_id, crop_id) DO UPDATE SET seeds = seeds + excluded.seeds, updated_at = excluded.updated_at`,
  )
    .bind(user.id, cropId, qty, Date.now())
    .run()
  return c.json({ ok: true, crops: await getCropInventory(c.env, user.id) })
})

/** POST /api/crops/plant — consume semillas y crea la parcela (ready_at server-side). */
crops.post('/plant', rateLimit('crops-plant', 60, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { cropId, plotIndex } = body as { cropId?: unknown; plotIndex?: unknown }
  if (typeof cropId !== 'string' || !(cropId in CROP_ECONOMY)) throw new HttpError(400, 'cultivo invalido')
  if (typeof plotIndex !== 'number' || !Number.isInteger(plotIndex) || plotIndex < 0 || plotIndex > PLOT_INDEX_MAX) {
    throw new HttpError(400, 'parcela invalida')
  }
  const quantity = parseIntIn((body as { quantity?: unknown })?.quantity, PLANT_MAX_QTY, 'quantity')
  const plantedAt = (body as { plantedAt?: unknown })?.plantedAt
  const now = Date.now()
  const pTime = typeof plantedAt === 'number' && Number.isInteger(plantedAt) ? plantedAt : now
  if (pTime > now || now - pTime > 90 * 24 * 3600 * 1000) throw new HttpError(400, 'plantedAt fuera de rango')

  // Consumo atomico de semillas + alta de parcela (todo o nada).
  const res = await c.env.DB.prepare(
    `UPDATE player_crops SET seeds = seeds - ?3, updated_at = ?4 WHERE user_id = ?1 AND crop_id = ?2 AND seeds >= ?3`,
  )
    .bind(user.id, cropId, quantity, now)
    .run()
  if ((res.meta.changes ?? 0) === 0) {
    return c.json({ ok: false, reason: 'no_seeds', crops: await getCropInventory(c.env, user.id) }, 409)
  }
  const def = CROP_ECONOMY[cropId]
  const readyAt = pTime + def.growthHours * 3600 * 1000
  try {
    await c.env.DB.prepare(
      `INSERT INTO player_crop_plots (user_id, plot_index, crop_id, quantity, planted_at, ready_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
      .bind(user.id, plotIndex, cropId, quantity, pTime, readyAt, now)
      .run()
  } catch (e) {
    // Parcela ocupada: devolver las semillas.
    await c.env.DB.prepare(
      `UPDATE player_crops SET seeds = seeds + ?3, updated_at = ?4 WHERE user_id = ?1 AND crop_id = ?2`,
    )
      .bind(user.id, cropId, quantity, Date.now())
      .run()
    throw new HttpError(409, 'Parcela ocupada')
  }
  return c.json({ ok: true, crops: await getCropInventory(c.env, user.id), plots: await getPlots(c.env, user.id) })
})

/** POST /api/crops/harvest — valida listo por tiempo y acredita la cosecha. */
crops.post('/harvest', rateLimit('crops-harvest', 60, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { plotIndex } = body as { plotIndex?: unknown }
  if (typeof plotIndex !== 'number' || !Number.isInteger(plotIndex) || plotIndex < 0 || plotIndex > PLOT_INDEX_MAX) {
    throw new HttpError(400, 'parcela invalida')
  }
  const now = Date.now()
  const plot = await c.env.DB.prepare(
    `SELECT crop_id AS cropId, quantity, ready_at AS readyAt FROM player_crop_plots
      WHERE user_id = ?1 AND plot_index = ?2`,
  )
    .bind(user.id, plotIndex)
    .first<{ cropId: string; quantity: number; readyAt: number }>()
  if (!plot) return c.json({ ok: false, reason: 'not_planted' }, 404)
  if (now < plot.readyAt) return c.json({ ok: false, reason: 'not_ready' }, 409)

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM player_crop_plots WHERE user_id = ?1 AND plot_index = ?2`).bind(user.id, plotIndex),
    c.env.DB.prepare(
      `INSERT INTO player_crops (user_id, crop_id, seeds, harvest, updated_at) VALUES (?1, ?2, 0, ?3, ?4)
       ON CONFLICT(user_id, crop_id) DO UPDATE SET harvest = harvest + excluded.harvest, updated_at = excluded.updated_at`,
    ).bind(user.id, plot.cropId, plot.quantity, now),
  ])
  return c.json({ ok: true, harvested: plot.quantity, crops: await getCropInventory(c.env, user.id) })
})

/** POST /api/crops/sell — venta VALIDADA server-side al precio del servidor. */
crops.post('/sell', rateLimit('crops-sell', 30, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { cropId } = body as { cropId?: unknown }
  if (typeof cropId !== 'string' || !(cropId in CROP_ECONOMY)) throw new HttpError(400, 'cultivo invalido')
  const qty = parseIntIn((body as { qty?: unknown })?.qty, SELL_MAX_QTY, 'qty')
  const now = Date.now()

  const res = await c.env.DB.prepare(
    `UPDATE player_crops SET harvest = harvest - ?3, updated_at = ?4 WHERE user_id = ?1 AND crop_id = ?2 AND harvest >= ?3`,
  )
    .bind(user.id, cropId, qty, now)
    .run()
  if ((res.meta.changes ?? 0) === 0) {
    return c.json({ ok: false, reason: 'insufficient', crops: await getCropInventory(c.env, user.id) }, 400)
  }

  const amountMinor = Math.round(CROP_ECONOMY[cropId].sellPrice * 100) * qty
  await creditSale(c.env, { userId: user.id, amountMinor, sourceId: now })
  const w = await c.env.DB.prepare(
    `SELECT available_minor AS availableMinor FROM wallets WHERE user_id = ?1 AND currency = 'USD'`,
  )
    .bind(user.id)
    .first<{ availableMinor: number }>()
  return c.json({ ok: true, availableMinor: w?.availableMinor ?? 0, creditedMinor: amountMinor, crops: await getCropInventory(c.env, user.id) })
})

function parseIntIn(qty: unknown, max: number, label = 'qty'): number {
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0 || qty > max) {
    throw new HttpError(400, `${label} debe ser un entero entre 1 y ${max}`)
  }
  return qty
}

export default crops