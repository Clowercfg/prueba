/**
 * API de administración. Todo el grupo exige autenticación Telegram válida y
 * rol ADMIN/SUPER_ADMIN (verificado server-side). Cada acción financiera es
 * condicional (un solo ganador bajo concurrencia), idempotente y auditada.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { HttpError } from '../auth'
import { adminGuard, rateLimit, requireAuth } from '../middleware'
import { audit, transitionStatus } from '../services/audit'
import { creditDeposit, releaseWithdrawal, settleWithdrawal } from '../services/ledger'

const admin = new Hono<AppEnv>()

admin.use('*', rateLimit('admin', 120, 60))
admin.use('*', adminGuard('ADMIN'))

const PAGE = 20
function pageOf(c: { req: { query: (k: string) => string | undefined } }): number {
  return Math.max(1, Number(c.req.query('page') ?? '1') || 1)
}
function reasonOf(body: unknown): string {
  const r = (body as { reason?: unknown })?.reason
  if (typeof r !== 'string' || r.trim().length < 3 || r.trim().length > 500) {
    throw new HttpError(400, 'reason obligatoria (3-500 caracteres)')
  }
  return r.trim()
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */

admin.get('/dashboard', async (c) => {
  const [totals, recent] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM withdrawals WHERE status IN ('PENDING','UNDER_REVIEW')) AS pendingWithdrawals,
         (SELECT COUNT(*) FROM deposits    WHERE status IN ('PENDING','UNDER_REVIEW')) AS pendingDeposits,
         (SELECT COUNT(*) FROM users)                                                 AS totalUsers,
         (SELECT COALESCE(SUM(available_minor),0) FROM wallets WHERE currency='USD')   AS totalAvailableMinor,
         (SELECT COALESCE(SUM(reserved_minor),0)  FROM wallets WHERE currency='USD')   AS totalReservedMinor`,
    ).first(),
    c.env.DB.prepare(
      `SELECT 'withdrawal' AS kind, w.id, w.user_id AS userId, u.username, u.telegram_id AS telegramId,
              w.amount_minor AS amountMinor, w.currency, w.status, w.created_at AS createdAt
         FROM withdrawals w JOIN users u ON u.id = w.user_id
        ORDER BY w.created_at DESC LIMIT 8`,
    ).all(),
  ])
  const recentDeposits = await c.env.DB.prepare(
    `SELECT 'deposit' AS kind, d.id, d.user_id AS userId, u.username, u.telegram_id AS telegramId,
            d.amount_minor AS amountMinor, d.currency, d.status, d.created_at AS createdAt
       FROM deposits d JOIN users u ON u.id = d.user_id
      ORDER BY d.created_at DESC LIMIT 8`,
  ).all()

  const ops = [...(recent.results ?? []), ...(recentDeposits.results ?? [])]
    .sort((a, b) => Number((b as { createdAt: number }).createdAt) - Number((a as { createdAt: number }).createdAt))
    .slice(0, 8)

  return c.json({ totals, recentOps: ops })
})

/* ── Retiros ────────────────────────────────────────────────────────────── */

const W_SELECT = `SELECT w.id, w.user_id AS userId, w.amount_minor AS amountMinor, w.currency,
                         w.method, w.destination_masked AS destinationMasked, w.status,
                         w.deny_reason AS denyReason, w.created_at AS createdAt,
                         u.username, u.first_name AS firstName, u.telegram_id AS telegramId
                    FROM withdrawals w JOIN users u ON u.id = w.user_id`

admin.get('/withdrawals', async (c) => {
  const status = c.req.query('status') ?? 'PENDING'
  const where = status === 'ALL' ? '' : 'WHERE w.status = ?1'
  const offset = (pageOf(c) - 1) * PAGE
  const rows = await c.env.DB.prepare(
    `${W_SELECT} ${where} ORDER BY w.created_at DESC LIMIT 21 ${status === 'ALL' ? '' : 'OFFSET ?2'}`,
  )
    .bind(...(status === 'ALL' ? [] : [status]), ...(status === 'ALL' ? [] : [offset]))
    .all()
  return c.json({ items: rows.results?.slice(0, PAGE), hasMore: (rows.results?.length ?? 0) > PAGE })
})

admin.get('/withdrawals/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const row = await c.env.DB.prepare(`${W_SELECT} WHERE w.id = ?1`).bind(id).first()
  if (!row) throw new HttpError(404, 'Retiro no encontrado')
  const userId = (row as { userId: number }).userId

  const [wallet, ledger] = await Promise.all([
    c.env.DB.prepare(
      `SELECT available_minor AS availableMinor, reserved_minor AS reservedMinor FROM wallets WHERE user_id=?1 AND currency='USD'`,
    )
      .bind(userId)
      .first(),
    c.env.DB.prepare(
      `SELECT type, direction, amount_minor AS amountMinor, source_type AS sourceType, source_id AS sourceId, created_at AS createdAt
         FROM wallet_ledger WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 6`,
    )
      .bind(userId)
      .all(),
  ])
  return c.json({ withdrawal: row, walletBalance: wallet, financialHistory: ledger.results ?? [] })
})

admin.post('/withdrawals/:id/approve', rateLimit('fin-action', 30, 60), async (c) => {
  const a = c.get('user')
  const id = Number(c.req.param('id'))
  const w = await c.env.DB.prepare(
    `SELECT id, user_id AS userId, amount_minor AS amountMinor, currency, status FROM withdrawals WHERE id = ?1`,
  )
    .bind(id)
    .first<{ id: number; userId: number; amountMinor: number; currency: string; status: string }>()
  if (!w) throw new HttpError(404, 'Retiro no encontrado')

  // Un solo ganador: si otro admin cambió el estado, aquí termina.
  const won = await transitionStatus(c.env, 'withdrawals', id, ['PENDING'], 'APPROVED', { processedBy: a.id })
  if (!won) throw new HttpError(409, `El retiro ya no está PENDING (estado actual: ${w.status})`)

  await audit(c.env, {
    adminUserId: a.id, action: 'WITHDRAWAL_APPROVED', targetUserId: w.userId,
    targetTransactionId: id, oldStatus: 'PENDING', newStatus: 'APPROVED',
    amountMinor: w.amountMinor, currency: w.currency,
  })
  return c.json({ ok: true, id, status: 'APPROVED' })
})

admin.post('/withdrawals/:id/deny', rateLimit('fin-action', 30, 60), async (c) => {
  const a = c.get('user')
  const id = Number(c.req.param('id'))
  const reason = reasonOf(await c.req.json().catch(() => null))
  const w = await c.env.DB.prepare(
    `SELECT id, user_id AS userId, amount_minor AS amountMinor, currency, status FROM withdrawals WHERE id = ?1`,
  )
    .bind(id)
    .first<{ id: number; userId: number; amountMinor: number; currency: string; status: string }>()
  if (!w) throw new HttpError(404, 'Retiro no encontrado')

  const won = await transitionStatus(c.env, 'withdrawals', id, ['PENDING'], 'DENIED', { processedBy: a.id, denyReason: reason })
  if (!won) throw new HttpError(409, `El retiro ya no está PENDING (estado actual: ${w.status})`)

  // Los fondos reservados vuelven al disponible vía ledger (nunca balance += x).
  await releaseWithdrawal(c.env, { userId: w.userId, amountMinor: w.amountMinor, currency: w.currency, sourceType: 'withdrawal', sourceId: id })
  await audit(c.env, {
    adminUserId: a.id, action: 'WITHDRAWAL_DENIED', targetUserId: w.userId,
    targetTransactionId: id, oldStatus: 'PENDING', newStatus: 'DENIED',
    amountMinor: w.amountMinor, currency: w.currency, reason,
  })
  return c.json({ ok: true, id, status: 'DENIED' })
})

/** Marca COMPLETED solo cuando el dinero salió realmente (sin proveedor aún). */
admin.post('/withdrawals/:id/complete', rateLimit('fin-action', 30, 60), async (c) => {
  const a = c.get('user')
  const id = Number(c.req.param('id'))
  const w = await c.env.DB.prepare(
    `SELECT id, user_id AS userId, amount_minor AS amountMinor, currency, status FROM withdrawals WHERE id = ?1`,
  )
    .bind(id)
    .first<{ id: number; userId: number; amountMinor: number; currency: string; status: string }>()
  if (!w) throw new HttpError(404, 'Retiro no encontrado')

  const won = await transitionStatus(c.env, 'withdrawals', id, ['APPROVED', 'PROCESSING'], 'COMPLETED', { processedBy: a.id })
  if (!won) throw new HttpError(409, `Solo se completa desde APPROVED/PROCESSING (actual: ${w.status})`)

  await settleWithdrawal(c.env, { userId: w.userId, amountMinor: w.amountMinor, currency: w.currency, sourceType: 'withdrawal', sourceId: id })
  await audit(c.env, {
    adminUserId: a.id, action: 'WITHDRAWAL_COMPLETED', targetUserId: w.userId,
    targetTransactionId: id, oldStatus: w.status, newStatus: 'COMPLETED',
    amountMinor: w.amountMinor, currency: w.currency,
  })
  return c.json({ ok: true, id, status: 'COMPLETED' })
})

/* ── Depósitos ──────────────────────────────────────────────────────────── */

const D_SELECT = `SELECT d.id, d.user_id AS userId, d.amount_minor AS amountMinor, d.currency,
                         d.method, d.reference, d.source, d.status, d.created_at AS createdAt,
                         u.username, u.first_name AS firstName, u.telegram_id AS telegramId
                    FROM deposits d JOIN users u ON u.id = d.user_id`

admin.get('/deposits', async (c) => {
  const status = c.req.query('status') ?? 'PENDING'
  const where = status === 'ALL' ? '' : 'WHERE d.status = ?1'
  const offset = (pageOf(c) - 1) * PAGE
  const rows = await c.env.DB.prepare(
    `${D_SELECT} ${where} ORDER BY d.created_at DESC LIMIT 21 ${status === 'ALL' ? '' : 'OFFSET ?2'}`,
  )
    .bind(...(status === 'ALL' ? [] : [status]), ...(status === 'ALL' ? [] : [offset]))
    .all()
  return c.json({ items: rows.results?.slice(0, PAGE), hasMore: (rows.results?.length ?? 0) > PAGE })
})

/**
 * Aprueba un depósito MANUAL: transición condicional primero (un ganador),
 * luego crédito atómico con UNIQUE(type,'deposit',id) → imposible doble saldo.
 */
admin.post('/deposits/:id/approve', rateLimit('fin-action', 30, 60), async (c) => {
  const a = c.get('user')
  const id = Number(c.req.param('id'))
  const d = await c.env.DB.prepare(
    `SELECT id, user_id AS userId, amount_minor AS amountMinor, currency, method, reference, source, status
       FROM deposits WHERE id = ?1`,
  )
    .bind(id)
    .first<{ id: number; userId: number; amountMinor: number; currency: string; method: string; reference: string | null; source: string; status: string }>()
  if (!d) throw new HttpError(404, 'Depósito no encontrado')
  if (d.source === 'PROVIDER_VERIFIED') throw new HttpError(409, 'Los depósitos verificados por proveedor no requieren aprobación manual')

  const won = await transitionStatus(c.env, 'deposits', id, ['PENDING', 'UNDER_REVIEW'], 'COMPLETED', { processedBy: a.id })
  if (!won) throw new HttpError(409, `El depósito ya no está pendiente (estado actual: ${d.status})`)

  try {
    await creditDeposit(c.env, { userId: d.userId, amountMinor: d.amountMinor, currency: d.currency, sourceType: 'deposit', sourceId: id })
  } catch (e) {
    // Rollback lógico: sin crédito no puede quedar COMPLETED.
    await transitionStatus(c.env, 'deposits', id, ['COMPLETED'], 'PENDING', {})
    throw e
  }

  await audit(c.env, {
    adminUserId: a.id, action: 'DEPOSIT_APPROVED', targetUserId: d.userId,
    targetTransactionId: id, oldStatus: d.status, newStatus: 'COMPLETED',
    amountMinor: d.amountMinor, currency: d.currency,
    metadata: { method: d.method, reference: d.reference },
  })
  return c.json({ ok: true, id, status: 'COMPLETED' })
})

admin.post('/deposits/:id/cancel', rateLimit('fin-action', 30, 60), async (c) => {
  const a = c.get('user')
  const id = Number(c.req.param('id'))
  const reason = reasonOf(await c.req.json().catch(() => null))
  const d = await c.env.DB.prepare(`SELECT id, user_id AS userId, amount_minor AS amountMinor, currency, status FROM deposits WHERE id = ?1`)
    .bind(id)
    .first<{ id: number; userId: number; amountMinor: number; currency: string; status: string }>()
  if (!d) throw new HttpError(404, 'Depósito no encontrado')

  // deposits no guarda deny_reason (la razón vive en el audit log)
  const won = await transitionStatus(c.env, 'deposits', id, ['PENDING', 'UNDER_REVIEW'], 'CANCELLED', { processedBy: a.id })
  if (!won) throw new HttpError(409, `El depósito ya no está pendiente (estado actual: ${d.status})`)

  await audit(c.env, {
    adminUserId: a.id, action: 'DEPOSIT_CANCELLED', targetUserId: d.userId,
    targetTransactionId: id, oldStatus: d.status, newStatus: 'CANCELLED',
    amountMinor: d.amountMinor, currency: d.currency, reason,
  })
  return c.json({ ok: true, id, status: 'CANCELLED' })
})

/* ── Notificaciones globales ────────────────────────────────────────────── */

const NOTIF_TYPES = ['GENERAL', 'WARNING', 'SYSTEM', 'WEATHER', 'ECONOMY', 'MAINTENANCE']
const NOTIF_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']

admin.get('/notifications', async (c) => {
  const page = pageOf(c)
  const rows = await c.env.DB.prepare(
    `SELECT n.id, n.title, n.message, n.type, n.priority, n.target_type AS targetType,
            n.starts_at AS startsAt, n.expires_at AS expiresAt, n.sent_at AS sentAt,
            n.created_at AS createdAt, COUNT(r.user_id) AS recipients,
            SUM(CASE WHEN r.read_at IS NOT NULL THEN 1 ELSE 0 END) AS readCount
       FROM notifications n LEFT JOIN notification_receipts r ON r.notification_id = n.id
      GROUP BY n.id ORDER BY n.created_at DESC LIMIT 21 OFFSET ?1`,
  )
    .bind((page - 1) * PAGE)
    .all()
  return c.json({ items: rows.results?.slice(0, PAGE), hasMore: (rows.results?.length ?? 0) > PAGE })
})

admin.post('/notifications', rateLimit('notif-send', 5, 60), async (c) => {
  const a = c.get('user')
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const type = typeof body?.type === 'string' && NOTIF_TYPES.includes(body.type) ? body.type : 'GENERAL'
  const priority = typeof body?.priority === 'string' && NOTIF_PRIORITIES.includes(body.priority) ? body.priority : 'NORMAL'
  const startsAt = typeof body?.startsAt === 'number' ? body.startsAt : null
  const expiresAt = typeof body?.expiresAt === 'number' ? body.expiresAt : null
  if (title.length < 3 || title.length > 120) throw new HttpError(400, 'title: 3-120 caracteres')
  if (message.length < 5 || message.length > 2000) throw new HttpError(400, 'message: 5-2000 caracteres')
  if (startsAt && startsAt < Date.now()) throw new HttpError(400, 'startsAt debe ser futuro (usar envío inmediato si no)')
  if (expiresAt && startsAt && expiresAt <= startsAt) throw new HttpError(400, 'expiresAt debe ser posterior a startsAt')

  const now = Date.now()
  const inserted = await c.env.DB.prepare(
    `INSERT INTO notifications (title, message, type, priority, target_type, starts_at, expires_at, created_by, sent_at, created_at)
     VALUES (?1, ?2, ?3, ?4, 'ALL_USERS', ?5, ?6, ?7, ?8, ?9) RETURNING id`,
  )
    .bind(title, message, type, priority, startsAt, expiresAt, a.id, !startsAt || startsAt <= now ? now : null, now)
    .first<{ id: number }>()
  const id = Number(inserted?.id)

  // Fan-out de recibos a usuarios activos: estado READ/UNREAD individual.
  await c.env.DB.prepare(
    `INSERT INTO notification_receipts (notification_id, user_id)
      SELECT ?1, id FROM users WHERE status = 'ACTIVE'`,
  )
    .bind(id)
    .run()

  await audit(c.env, {
    adminUserId: a.id, action: 'GLOBAL_NOTIFICATION_CREATED', newStatus: String(id),
    metadata: { title, type, priority, scheduledFor: startsAt },
  })
  if (!startsAt || startsAt <= now) {
    await audit(c.env, { adminUserId: a.id, action: 'GLOBAL_NOTIFICATION_SENT', newStatus: String(id), metadata: { title } })
  }
  return c.json({ ok: true, id, recipients: 'ALL_USERS', scheduled: Boolean(startsAt && startsAt > now) }, 201)
})

/* ── Usuarios ───────────────────────────────────────────────────────────── */

admin.get('/users', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  const page = pageOf(c)
  let sql: string
  let bind: unknown[]
  if (/^\d+$/.test(q)) {
    sql = `${'SELECT id, telegram_id AS telegramId, username, first_name AS firstName, role, status, created_at AS createdAt FROM users'} WHERE telegram_id = ?1 OR CAST(id AS TEXT) = ?1 ORDER BY created_at DESC LIMIT 21 OFFSET ?2`
    bind = [q, (page - 1) * PAGE]
  } else if (q) {
    sql = `SELECT id, telegram_id AS telegramId, username, first_name AS firstName, role, status, created_at AS createdAt
             FROM users WHERE username LIKE '%' || ?1 || '%' OR first_name LIKE '%' || ?1 || '%'
            ORDER BY created_at DESC LIMIT 21 OFFSET ?2`
    bind = [q, (page - 1) * PAGE]
  } else {
    sql = `SELECT id, telegram_id AS telegramId, username, first_name AS firstName, role, status, created_at AS createdAt
             FROM users ORDER BY created_at DESC LIMIT 21 OFFSET ?1`
    bind = [(page - 1) * PAGE]
  }
  const rows = await c.env.DB.prepare(sql).bind(...bind).all()
  return c.json({ items: rows.results?.slice(0, PAGE), hasMore: (rows.results?.length ?? 0) > PAGE })
})

admin.get('/users/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const user = await c.env.DB.prepare(
    `SELECT id, telegram_id AS telegramId, username, first_name AS firstName, language_code AS languageCode,
            role, status, created_at AS createdAt FROM users WHERE id = ?1`,
  )
    .bind(id)
    .first()
  if (!user) throw new HttpError(404, 'Usuario no encontrado')

  const [wallet, totals] = await Promise.all([
    c.env.DB.prepare(`SELECT currency, available_minor AS availableMinor, reserved_minor AS reservedMinor FROM wallets WHERE user_id=?1`)
      .bind(id)
      .all(),
    c.env.DB.prepare(
      `SELECT
         (SELECT COALESCE(SUM(amount_minor),0) FROM deposits WHERE user_id=?1 AND status='COMPLETED') AS depositedCompleted,
         (SELECT COALESCE(SUM(amount_minor),0) FROM withdrawals WHERE user_id=?1 AND status='COMPLETED') AS withdrawnCompleted,
         (SELECT COUNT(*) FROM withdrawals WHERE user_id=?1 AND status IN ('PENDING','UNDER_REVIEW','APPROVED','PROCESSING')) AS withdrawalsOpen`,
    )
      .bind(id)
      .first(),
  ])
  return c.json({ user, wallets: wallet.results ?? [], totals })
})

/* ── Solo SUPER_ADMIN: gestión de roles ─────────────────────────────────── */

const superAdmin = new Hono<AppEnv>()
superAdmin.use('*', requireAuth)
superAdmin.use('*', adminGuard('SUPER_ADMIN'))

superAdmin.post('/users/:id/role', async (c) => {
  const a = c.get('user')
  const id = Number(c.req.param('id'))
  const body = (await c.req.json().catch(() => null)) as { role?: unknown } | null
  const role = body?.role
  if (role !== 'USER' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') throw new HttpError(400, 'role inválido')
  if (id === a.id) throw new HttpError(400, 'No puedes cambiar tu propio rol')

  const current = await c.env.DB.prepare(`SELECT id, role FROM users WHERE id = ?1`).bind(id).first<{ id: number; role: string }>()
  if (!current) throw new HttpError(404, 'Usuario no encontrado')

  await c.env.DB.prepare(`UPDATE users SET role = ?2, updated_at = ?3 WHERE id = ?1`).bind(id, role, Date.now()).run()
  await audit(c.env, {
    adminUserId: a.id, action: 'ROLE_CHANGED', targetUserId: id,
    oldStatus: current.role, newStatus: role,
  })
  return c.json({ ok: true, id, role })
})

/* ── Auditoría (solo lectura, sin borrado en la API ordinaria) ──────────── */

admin.get('/audit', async (c) => {
  const action = c.req.query('action')
  const page = pageOf(c)
  const rows = action
    ? await c.env.DB.prepare(
        `SELECT a.*, u.username AS adminUsername FROM admin_audit_log a JOIN users u ON u.id=a.admin_user_id
          WHERE a.action = ?1 ORDER BY a.created_at DESC LIMIT 21 OFFSET ?2`,
      )
        .bind(action.toUpperCase(), (page - 1) * PAGE)
        .all()
    : await c.env.DB.prepare(
        `SELECT a.*, u.username AS adminUsername FROM admin_audit_log a JOIN users u ON u.id=a.admin_user_id
          ORDER BY a.created_at DESC LIMIT 21 OFFSET ?1`,
      )
        .bind((page - 1) * PAGE)
        .all()
  return c.json({ items: rows.results?.slice(0, PAGE), hasMore: (rows.results?.length ?? 0) > PAGE })
})

export { superAdmin }
export default admin
