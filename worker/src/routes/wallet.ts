/**
 * Wallet del usuario: intención de depósito manual, solicitud de retiro con
 * reserva de fondos y consulta de saldo/historial de ledger.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { HttpError } from '../auth'
import { requireAuth, rateLimit } from '../middleware'
import { createWithdrawalWithReserve, debitPurchase, maskDestination } from '../services/ledger'
import { expectedDebitMinor } from '../services/prices'

const wallet = new Hono<AppEnv>()

wallet.use('*', requireAuth)

/** GET /api/wallet/deposit-config — datos para el apartado de depósitos
 *  (mismo contrato que el proyecto anterior: walletAddress/network/telegram). */
wallet.get('/deposit-config', (c) =>
  c.json({
    walletAddress: c.env.DEPOSIT_WALLET_ADDRESS ?? '',
    network: c.env.DEPOSIT_NETWORK ?? '',
    telegram: c.env.DEPOSIT_TELEGRAM ?? '',
  }),
)

function parseAmount(body: unknown): number {
  const { amountMinor } = (body ?? {}) as { amountMinor?: unknown }
  if (typeof amountMinor !== 'number' || !Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new HttpError(400, 'amountMinor debe ser un entero positivo (unidades menores)')
  }
  if (amountMinor > 1_000_000_000) throw new HttpError(400, 'Monto fuera de rango')
  return amountMinor
}

/** POST /api/wallet/deposits — registra depósito manual PENDING (sin acreditar). */
wallet.post('/deposits', rateLimit('deposit-create', 10, 60), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const amountMinor = parseAmount(body)
  const { method = 'MANUAL_CRYPTO', reference = null } = (body ?? {}) as { method?: string; reference?: string }

  const result = await c.env.DB.prepare(
    `INSERT INTO deposits (user_id, amount_minor, currency, method, reference, source, status, created_at)
     VALUES (?1, ?2, 'USD', ?3, ?4, 'MANUAL', 'PENDING', ?5) RETURNING id`,
  )
    .bind(user.id, amountMinor, String(method).slice(0, 40), reference ? String(reference).slice(0, 200) : null, Date.now())
    .first<{ id: number }>()

  return c.json({ id: Number(result?.id), status: 'PENDING' }, 201)
})

/** GET /api/wallet/deposits — historial propio. */
wallet.get('/deposits', async (c) => {
  const user = c.get('user')
  const page = Math.max(1, Number(c.req.query('page') ?? '1') || 1)
  const rows = await c.env.DB.prepare(
    `SELECT id, amount_minor AS amountMinor, currency, method, reference, status, created_at AS createdAt
       FROM deposits WHERE user_id = ?1
      ORDER BY created_at DESC LIMIT 21 OFFSET ?2`,
  )
    .bind(user.id, (page - 1) * 20)
    .all()
  return c.json({ items: rows.results?.slice(0, 20), hasMore: (rows.results?.length ?? 0) > 20 })
})

/**
 * POST /api/wallet/withdrawals — crea la solicitud y RESERVA los fondos.
 * El destino se enmascara server-side antes de persistir.
 */
wallet.post('/withdrawals', rateLimit('withdrawal-create', 10, 60), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const amountMinor = parseAmount(body)
  const raw = body as { method?: unknown; destination?: unknown }
  const method = typeof raw.method === 'string' && raw.method.trim() ? raw.method.trim().slice(0, 40) : ''
  const destination = typeof raw.destination === 'string' ? raw.destination.trim() : ''
  if (!method || destination.length < 8 || destination.length > 200) {
    throw new HttpError(400, 'method y destination (8-200 chars) son obligatorios')
  }

  const id = await createWithdrawalWithReserve(c.env, {
    userId: user.id,
    amountMinor,
    currency: 'USD',
    method,
    destinationMasked: maskDestination(destination),
  })
  return c.json({ id, status: 'PENDING', reserved: amountMinor }, 201)
})

/** GET /api/wallet/withdrawals — solicitudes propias. */
wallet.get('/withdrawals', async (c) => {
  const user = c.get('user')
  const page = Math.max(1, Number(c.req.query('page') ?? '1') || 1)
  const rows = await c.env.DB.prepare(
    `SELECT id, amount_minor AS amountMinor, currency, method, destination_masked AS destinationMasked,
            status, deny_reason AS denyReason, created_at AS createdAt
       FROM withdrawals WHERE user_id = ?1
      ORDER BY created_at DESC LIMIT 21 OFFSET ?2`,
  )
    .bind(user.id, (page - 1) * 20)
    .all()
  return c.json({ items: rows.results?.slice(0, 20), hasMore: (rows.results?.length ?? 0) > 20 })
})

/** POST /api/wallet/debit — compra con saldo USDT (animales/combos/mejoras).
 *  Server-authoritative: el importe enviado debe coincidir EXACTAMENTE con el
 *  precio calculado en el servidor (ver services/prices.ts); sin saldo
 *  suficiente falla y NO se entrega nada. */
wallet.post('/debit', rateLimit('purchase', 30, 60), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const amountMinor = parseAmount(body)
  const concept = ((body as { concept?: unknown })?.concept ?? '') as string
  if (!concept) throw new HttpError(400, 'concept es obligatorio')
  const expected = expectedDebitMinor(concept, (body as Record<string, unknown>) ?? {})
  if (expected === null) throw new HttpError(400, 'Concepto de compra no soportado')
  if (amountMinor !== expected) throw new HttpError(400, `El importe no coincide con el precio del servidor (esperado ${expected})`)
  const sourceId = Date.now()
  console.log('[DEBIT] user:', user?.id, 'amountMinor:', amountMinor, 'sourceId:', sourceId, 'telegramId:', user?.telegramId)
  try {
    await debitPurchase(c.env, { userId: user.id, amountMinor, sourceId })
  } catch (e) {
    console.log('[DEBIT] ERROR:', e instanceof Error ? e.message : e, 'status:', e instanceof HttpError ? e.status : 'N/A')
    // Si el débito falla por CHECK (saldo insuficiente), incluir el saldo real
    // en la respuesta para que el cliente pueda mostrarlo.
    if (e instanceof HttpError && e.status === 400) {
      const w = await c.env.DB.prepare(
        `SELECT available_minor AS availableMinor FROM wallets WHERE user_id = ?1 AND currency = 'USD'`,
      )
        .bind(user.id)
        .first<{ availableMinor: number }>()
      return c.json({ error: e.message, availableMinor: w?.availableMinor ?? 0 }, 400)
    }
    throw e
  }
  const w = await c.env.DB.prepare(
    `SELECT available_minor AS availableMinor FROM wallets WHERE user_id = ?1 AND currency = 'USD'`,
  )
    .bind(user.id)
    .first<{ availableMinor: number }>()
  return c.json({ ok: true, availableMinor: w?.availableMinor ?? 0 })
})

/** POST /api/wallet/credit — DESACTIVADO.
 *  Era el money-printer: cualquier cliente podía acreditarse montos arbitrarios.
 *  Todas las acreditaciones (ventas de productos/cosechas, depósitos,
 *  comisiones) pasan ahora por rutas validadas server-side. Se devuelve 403
 *  para que un cliente viejo que lo llame quede bloqueado, no ignorado. */
wallet.post('/credit', async (c) => {
  throw new HttpError(403, 'El credito directo esta deshabilitado: usa las ventas validadas server-side')
})

/** GET /api/wallet — saldos + últimas entradas del ledger. */
wallet.get('/', async (c) => {
  const user = c.get('user')
  const [wallets, ledger] = await Promise.all([
    c.env.DB.prepare(
      `SELECT currency, available_minor AS availableMinor, reserved_minor AS reservedMinor
         FROM wallets WHERE user_id = ?1`,
    )
      .bind(user.id)
      .all(),
    c.env.DB.prepare(
      `SELECT type, direction, amount_minor AS amountMinor, currency, source_type AS sourceType,
              source_id AS sourceId, created_at AS createdAt
         FROM wallet_ledger WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 20`,
    )
      .bind(user.id)
      .all(),
  ])
  return c.json({ wallets: wallets.results ?? [], ledger: ledger.results ?? [] })
})

export default wallet
