/**
 * Productos del jugador (inventario autoritativo en D1).
 *
 * El stock vive en player_goods. Las ventas (POST /sell) descuentan inventario
 * de forma atomic y acreditan USDT al PRECIO DEL SERVIDOR via ledger (nunca se
 * confia en el monto informado por el cliente). La produccion animal se limita
 * por tiempo transcurrido (periodos reales) y el procesamiento por el pool de
 * insumos ya consumidos. Cierra el money-printer de POST /api/wallet/credit.
 */

import { Hono } from 'hono'
import type { AppEnv, Env } from '../env'
import { HttpError } from '../auth'
import { requireAuth, rateLimit } from '../middleware'
import { creditSale } from '../services/ledger'

/** Precio de venta por unidad (espejo server-side de GOODS_ECONOMY). */
const GOOD_SELL_PRICE: Record<string, number> = {
  milk: 0.9,
  eggs: 0.05,
  meat: 0.6,
  'boiled-eggs': 0.07,
}

/** Cota por producto en el snapshot de import legado (una vez por cuenta). */
const LEGACY_GOOD_CAP = 9999
const LEGACY_ANIMAL_CAP = 100
/** Cuentas nuevas no arrancan con nada (sin starter gratis). */
const NEW_STARTER_GOODS: Record<string, number> = {}

/** Produccion por periodo real por especie (espejo de animalAI.ts). */
const KIND_PRODUCTION: Record<string, { goodId: string; periodSec: number; units: number }> = {
  chicken: { goodId: 'eggs', periodSec: 5 * 3600, units: 1 },
  rooster: { goodId: 'eggs', periodSec: 24 * 3600, units: 1 },
  cow: { goodId: 'milk', periodSec: 8 * 3600, units: 1 },
  pig: { goodId: 'meat', periodSec: 7 * 24 * 3600, units: 60 },
}

const MINUTE = 60
const SELL_MAX_QTY = 100_000
/** Bono de bienvenida: 1 gallina gratis, una sola vez por cuenta. */
const WELCOME_BONUS_KIND = 'chicken'
const WELCOME_BONUS_QTY = 1

const goods = new Hono<AppEnv>()
goods.use('*', requireAuth)

/** Inventario del jugador (solo filas con stock). */
async function getInventory(env: Env, userId: number): Promise<Record<string, number>> {
  const rows = await env.DB.prepare(
    `SELECT good_id AS goodId, qty FROM player_goods WHERE user_id = ?1 AND qty > 0`,
  )
    .bind(userId)
    .all<{ goodId: string; qty: number }>()
  const out: Record<string, number> = {}
  for (const r of rows.results ?? []) out[r.goodId] = r.qty
  return out
}

function parseIntIn(qty: unknown, max: number, label = 'qty'): number {
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0 || qty > max) {
    throw new HttpError(400, `${label} debe ser un entero entre 1 y ${max}`)
  }
  return qty
}

/** Cuenta creada antes del despliegue de 0004 (puede importar su stock local). */
async function isLegacyAccount(env: Env, userId: number): Promise<boolean> {
  const m = await env.DB.prepare(
    `SELECT applied_at FROM d1_migrations WHERE name LIKE '0004%' ORDER BY applied_at DESC LIMIT 1`,
  )
    .first<{ applied_at: unknown }>()
  const raw = m?.applied_at
  let cut = Number.NaN
  if (typeof raw === 'number') {
    cut = raw
  } else if (typeof raw === 'string') {
    // applied_at llega como texto "YYYY-MM-DD HH:MM:SS" (UTC). Normalizamos a ISO.
    const iso = raw.replace(' ', 'T')
    const withTz = /[+-]\d\d:\d\d$/.test(iso) || iso.endsWith('Z') ? iso : `${iso}Z`
    cut = Date.parse(withTz)
  }
  if (Number.isNaN(cut)) return true // fallback: tratar como legado
  const u = await env.DB.prepare(`SELECT created_at AS created FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ created: number }>()
  return (u?.created ?? cut) < cut
}

function sanitizeSnapshotGoods(entries: Record<string, number> | unknown, legacy: boolean): Record<string, number> {
  const out: Record<string, number> = {}
  if (!entries || typeof entries !== 'object') return out
  const raw = entries as Record<string, number>
  if (!legacy) {
    for (const g of Object.keys(NEW_STARTER_GOODS)) {
      if (typeof raw[g] === 'number' && Number.isInteger(raw[g]) && raw[g] >= 0) {
        out[g] = Math.min(raw[g], NEW_STARTER_GOODS[g])
      }
    }
    return out
  }
  for (const [id, qty] of Object.entries(raw)) {
    if (!(id in GOOD_SELL_PRICE)) continue
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 0) continue
    if (qty > LEGACY_GOOD_CAP) continue
    out[id] = qty
  }
  return out
}

function sanitizeSnapshotAnimals(entries: Record<string, number> | unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!entries || typeof entries !== 'object') return out
  for (const [kind, count] of Object.entries(entries as Record<string, number>)) {
    if (!(kind in KIND_PRODUCTION)) continue
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) continue
    if (count > LEGACY_ANIMAL_CAP) continue
    out[kind] = count
  }
  return out
}

/**
 * POST /api/goods/init — import LOCAL persistido (unica vez por cuenta).
 * Legado: importa su stock existente (acotado). Cuentas nuevas: solo el starter.
 * Ya inicializado => se ignora y devuelve el inventario autoritativo.
 */
goods.post('/init', rateLimit('goods-init', 10, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const existed = await c.env.DB.prepare(`SELECT 1 AS x FROM player_goods WHERE user_id = ?1 LIMIT 1`)
    .bind(user.id)
    .first()
  if (existed) return c.json({ ok: true, initialized: true, goods: await getInventory(c.env, user.id) })

  const legacy = await isLegacyAccount(c.env, user.id)
  const snapshotGoods = sanitizeSnapshotGoods((body as { goods?: unknown })?.goods, legacy)
  const snapshotAnimals = sanitizeSnapshotAnimals((body as { animals?: unknown })?.animals)
  const ts = Date.now()

  const stmts = [
    ...Object.entries(snapshotGoods).map(([id, qty]) =>
      c.env.DB.prepare(
        `INSERT INTO player_goods (user_id, good_id, qty, updated_at) VALUES (?1, ?2, ?3, ?4)`,
      ).bind(user.id, id, qty, ts),
    ),
    ...Object.entries(snapshotAnimals).map(([kind, count]) =>
      c.env.DB.prepare(
        `INSERT INTO player_animals (user_id, kind, count, last_produce_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(user.id, kind, count, ts, ts),
    ),
  ]
  if (stmts.length > 0) await c.env.DB.batch(stmts)
  return c.json({ ok: true, initialized: true, goods: await getInventory(c.env, user.id) })
})

/** POST /api/goods/animals — registra animales comprados (incrementa count). */
goods.post('/animals', rateLimit('goods-animals', 30, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const items = (body as { items?: unknown })?.items
  if (!Array.isArray(items) || items.length === 0 || items.length > 40) {
    throw new HttpError(400, 'items es obligatorio (array no vacio, max 40)')
  }
  const ts = Date.now()
  const stmts = items.map((it) => {
    const { kind, qty } = (it ?? {}) as { kind?: unknown; qty?: unknown }
    if (typeof kind !== 'string' || !(kind in KIND_PRODUCTION)) throw new HttpError(400, `tipo de animal invalido: ${String(kind)}`)
    const n = parseIntIn(qty, 100, 'qty')
    return c.env.DB.prepare(
      `INSERT INTO player_animals (user_id, kind, count, last_produce_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(user_id, kind) DO UPDATE SET count = count + excluded.count, updated_at = excluded.updated_at`,
    ).bind(user.id, kind, n, ts, ts)
  })
  await c.env.DB.batch(stmts)
  return c.json({ ok: true })
})

/**
 * POST /api/goods/produce — acredita produccion VALIDADA por el servidor.
 * via 'animal': acotada por count * floor(elapsed / periodSec) * units.
 * via 'processing': acotada por el pool de insumos ya consumidos (1:1).
 * Devuelve lo realmente acreditado (credited) para que el cliente ajuste.
 */
goods.post('/produce', rateLimit('goods-produce', 60, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { goodId, via } = (body ?? {}) as { goodId?: unknown; via?: unknown }
  if (typeof goodId !== 'string' || !(goodId in GOOD_SELL_PRICE)) throw new HttpError(400, 'producto invalido')
  const qty = parseIntIn((body as { qty?: unknown })?.qty, SELL_MAX_QTY, 'qty')
  const authed = user.id
  const now = Date.now()

  if (via === 'animal') {
    const kind = (body as { kind?: unknown })?.kind
    if (typeof kind !== 'string' || !(kind in KIND_PRODUCTION)) throw new HttpError(400, 'kind es obligatorio para via animal')
    const def = KIND_PRODUCTION[kind]
    if (def.goodId !== goodId) throw new HttpError(400, 'el producto no corresponde al animal')

    const row = await c.env.DB.prepare(
      `SELECT count, last_produce_at AS lastProduceAt FROM player_animals WHERE user_id = ?1 AND kind = ?2`,
    )
      .bind(authed, kind)
      .first<{ count: number; lastProduceAt: number }>()
    if (!row || row.count <= 0) return c.json({ ok: true, credited: 0, goods: await getInventory(c.env, authed) })

    const periods = Math.floor((now - row.lastProduceAt) / def.periodSec)
    if (periods <= 0) return c.json({ ok: true, credited: 0, goods: await getInventory(c.env, authed) })

    const perCycle = row.count * def.units
    const eligible = perCycle * periods
    const took = Math.min(qty, eligible)
    // Solo acreditamos ciclos COMPLETOS (enteros) para poder avanzar la fecha exacta.
    const credited = took - (took % perCycle)
    if (credited <= 0) return c.json({ ok: true, credited: 0, goods: await getInventory(c.env, authed) })

    const cyclesUsed = credited / perCycle
    const newLast = row.lastProduceAt + cyclesUsed * def.periodSec
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE player_animals SET last_produce_at = ?3, updated_at = ?4 WHERE user_id = ?1 AND kind = ?2`,
      ).bind(authed, kind, newLast, now),
      c.env.DB.prepare(
        `INSERT INTO player_goods (user_id, good_id, qty, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(user_id, good_id) DO UPDATE SET qty = qty + excluded.qty, updated_at = excluded.updated_at`,
      ).bind(authed, goodId, credited, now),
    ])
    return c.json({ ok: true, credited, goods: await getInventory(c.env, authed) })
  }

  if (via === 'processing') {
    const inputGoodId = (body as { inputGoodId?: unknown })?.inputGoodId
    if (typeof inputGoodId !== 'string' || !(inputGoodId in GOOD_SELL_PRICE)) {
      throw new HttpError(400, 'inputGoodId es obligatorio para via processing')
    }
    const row = await c.env.DB.prepare(
      `SELECT qty FROM player_processing_pool WHERE user_id = ?1 AND good_id = ?2`,
    )
      .bind(authed, inputGoodId)
      .first<{ qty: number }>()
    const available = row?.qty ?? 0
    if (available <= 0) return c.json({ ok: true, credited: 0, goods: await getInventory(c.env, authed) })
    const credited = Math.min(qty, available)
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE player_processing_pool SET qty = qty - ?3, updated_at = ?4 WHERE user_id = ?1 AND good_id = ?2`,
      ).bind(authed, inputGoodId, credited, now),
      c.env.DB.prepare(
        `INSERT INTO player_goods (user_id, good_id, qty, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(user_id, good_id) DO UPDATE SET qty = qty + excluded.qty, updated_at = excluded.updated_at`,
      ).bind(authed, goodId, credited, now),
    ])
    return c.json({ ok: true, credited, goods: await getInventory(c.env, authed) })
  }

  throw new HttpError(400, 'via debe ser animal o processing')
})

/**
 * POST /api/goods/consume — retira stock (procesamiento/recetas) y lo reserva
 * en el pool (el output 1:1 solo se podra producir consumiendo esa reserva).
 */
goods.post('/consume', rateLimit('goods-consume', 30, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { goodId } = body as { goodId?: unknown }
  if (typeof goodId !== 'string' || !(goodId in GOOD_SELL_PRICE)) throw new HttpError(400, 'producto invalido')
  const qty = parseIntIn((body as { qty?: unknown })?.qty, SELL_MAX_QTY, 'qty')
  const now = Date.now()

  const res = await c.env.DB.prepare(
    `UPDATE player_goods SET qty = qty - ?3, updated_at = ?4 WHERE user_id = ?1 AND good_id = ?2 AND qty >= ?3`,
  )
    .bind(user.id, goodId, qty, now)
    .run()
  if ((res.meta.changes ?? 0) === 0) {
    return c.json({ ok: false, reason: 'insufficient', goods: await getInventory(c.env, user.id) }, 409)
  }
  await c.env.DB.prepare(
    `INSERT INTO player_processing_pool (user_id, good_id, qty, updated_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(user_id, good_id) DO UPDATE SET qty = qty + excluded.qty, updated_at = excluded.updated_at`,
  )
    .bind(user.id, goodId, qty, now)
    .run()
  return c.json({ ok: true, goods: await getInventory(c.env, user.id) })
})

/**
 * POST /api/goods/consume-cancel — devuelve insumos ya consumidos (pool) al
 * inventario. Usado cuando el pago del procesamiento falla tras el consumo:
 * el coste se revierte SIN montos controlados por el cliente.
 */
goods.post('/consume-cancel', rateLimit('goods-consume', 30, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { goodId } = body as { goodId?: unknown }
  if (typeof goodId !== 'string' || !(goodId in GOOD_SELL_PRICE)) throw new HttpError(400, 'producto invalido')
  const qty = parseIntIn((body as { qty?: unknown })?.qty, SELL_MAX_QTY, 'qty')
  const now = Date.now()

  const res = await c.env.DB.prepare(
    `UPDATE player_processing_pool SET qty = qty - ?3, updated_at = ?4 WHERE user_id = ?1 AND good_id = ?2 AND qty >= ?3`,
  )
    .bind(user.id, goodId, qty, now)
    .run()
  if ((res.meta.changes ?? 0) === 0) {
    return c.json({ ok: false, reason: 'insufficient', goods: await getInventory(c.env, user.id) }, 409)
  }
  await c.env.DB.prepare(
    `INSERT INTO player_goods (user_id, good_id, qty, updated_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(user_id, good_id) DO UPDATE SET qty = qty + excluded.qty, updated_at = excluded.updated_at`,
  )
    .bind(user.id, goodId, qty, now)
    .run()
  return c.json({ ok: true, goods: await getInventory(c.env, user.id) })
})

/**
 * POST /api/goods/sell — venta VALIDADA server-side.
 * Descuenta stock de forma atomica y acredita USDT al precio del servidor.
 */
goods.post('/sell', rateLimit('goods-sell', 30, MINUTE), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { goodId } = body as { goodId?: unknown }
  if (typeof goodId !== 'string' || !(goodId in GOOD_SELL_PRICE)) throw new HttpError(400, 'producto invalido')
  const qty = parseIntIn((body as { qty?: unknown })?.qty, SELL_MAX_QTY, 'qty')
  const now = Date.now()

  const res = await c.env.DB.prepare(
    `UPDATE player_goods SET qty = qty - ?3, updated_at = ?4 WHERE user_id = ?1 AND good_id = ?2 AND qty >= ?3`,
  )
    .bind(user.id, goodId, qty, now)
    .run()
  if ((res.meta.changes ?? 0) === 0) {
    return c.json({ ok: false, reason: 'insufficient', goods: await getInventory(c.env, user.id) }, 400)
  }

  const amountMinor = Math.round(GOOD_SELL_PRICE[goodId] * 100) * qty
  await creditSale(c.env, { userId: user.id, amountMinor, sourceId: now })
  const w = await c.env.DB.prepare(
    `SELECT available_minor AS availableMinor FROM wallets WHERE user_id = ?1 AND currency = 'USD'`,
  )
    .bind(user.id)
    .first<{ availableMinor: number }>()
  return c.json({ ok: true, availableMinor: w?.availableMinor ?? 0, creditedMinor: amountMinor, goods: await getInventory(c.env, user.id) })
})

/** GET /api/goods — inventario autoritativo (tras init). */
goods.get('/', async (c) => {
  const user = c.get('user')
  return c.json({ goods: await getInventory(c.env, user.id) })
})

/**
 * GET /api/goods/welcome-bonus — si el usuario aun puede reclamar el bono
 * de bienvenida (1 gallina gratis, una sola vez por cuenta).
 */
goods.get('/welcome-bonus', async (c) => {
  const user = c.get('user')
  const row = await c.env.DB.prepare(
    `SELECT welcome_bonus_claimed AS claimed FROM users WHERE id = ?1`,
  )
    .bind(user.id)
    .first<{ claimed: number }>()
  return c.json({ available: (row?.claimed ?? 1) === 0 })
})

/**
 * POST /api/goods/welcome-bonus/claim — reclama la gallina gratis.
 * Idempotente: si el flag ya estaba en 1 no vuelve a conceder (granted=false).
 */
goods.post('/welcome-bonus/claim', rateLimit('goods-welcome', 5, MINUTE), async (c) => {
  const user = c.get('user')
  const now = Date.now()
  const res = await c.env.DB.prepare(
    `UPDATE users SET welcome_bonus_claimed = 1, updated_at = ?2 WHERE id = ?1 AND welcome_bonus_claimed = 0`,
  )
    .bind(user.id, now)
    .run()
  if ((res.meta.changes ?? 0) === 0) return c.json({ ok: true, granted: false })
  await c.env.DB.prepare(
    `INSERT INTO player_animals (user_id, kind, count, last_produce_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(user_id, kind) DO UPDATE SET count = count + excluded.count, updated_at = excluded.updated_at`,
  )
    .bind(user.id, WELCOME_BONUS_KIND, WELCOME_BONUS_QTY, now, now)
    .run()
  return c.json({ ok: true, granted: true })
})

export default goods