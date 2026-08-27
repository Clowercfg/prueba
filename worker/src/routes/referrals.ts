/**
 * Sistema de referidos: codigo unico por usuario, registro de referido,
 * estadisticas de red e historial de comisiones por deposito referido.
 *
 * Comision: 5% (500 bps) del monto depositado, acreditado como PENDING
 * cuando el deposito referido pasa a COMPLETED. El admin puede liberar/
 * revertir comisiones.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { HttpError } from '../auth'
import { requireAuth, rateLimit } from '../middleware'

const referrals = new Hono<AppEnv>()
referrals.use('*', requireAuth)

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function generateCode(telegramId: string): string {
  // FARM- + ultimos 6 chars del hash del telegramId (uppercase hex).
  const suffix = telegramId.split('').reverse().join('').padEnd(6, '0').slice(0, 6).toUpperCase()
  return `FARM-${suffix}`
}

const COMMISSION_BPS = 500 // 5%

/* ── GET /api/referrals/code — obtener o generar codigo propio ────────────── */
referrals.get('/code', async (c) => {
  const user = c.get('user')
  const existing = await c.env.DB.prepare(
    `SELECT code FROM referral_codes WHERE user_id = ?1`,
  ).bind(user.id).first<{ code: string }>()
  if (existing) return c.json({ code: existing.code })

  const code = generateCode(user.telegramId)
  try {
    await c.env.DB.prepare(
      `INSERT INTO referral_codes (user_id, code, created_at) VALUES (?1, ?2, ?3)`,
    ).bind(user.id, code, Date.now()).run()
  } catch {
    // Si el codigo colisiona (extremadamente raro), reintenta con sufijo.
    const fallback = `${code.slice(0, -1)}${Math.random().toString(36).slice(2, 3).toUpperCase()}`
    await c.env.DB.prepare(
      `INSERT INTO referral_codes (user_id, code, created_at) VALUES (?1, ?2, ?3)`,
    ).bind(user.id, fallback, Date.now()).run()
    return c.json({ code: fallback })
  }
  return c.json({ code })
})

/* ── POST /api/referrals/register — registrarse con codigo de referido ────── */
referrals.post('/register', rateLimit('ref-register', 5, 60), async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => null)
  const { code } = (body ?? {}) as { code?: string }
  if (!code || typeof code !== 'string') throw new HttpError(400, 'code requerido')

  // Verificar que el usuario no tenga ya un referente.
  const existing = await c.env.DB.prepare(
    `SELECT id FROM referrals WHERE referred_id = ?1`,
  ).bind(user.id).first<{ id: number }>()
  if (existing) throw new HttpError(400, 'Ya tienes un patrocinador')

  // Buscar el codigo.
  const referrer = await c.env.DB.prepare(
    `SELECT user_id FROM referral_codes WHERE code = ?1`,
  ).bind(code.trim().toUpperCase()).first<{ user_id: number }>()
  if (!referrer) throw new HttpError(400, 'Codigo de referido no valido')

  // Auto-referencia.
  if (referrer.user_id === user.id) throw new HttpError(400, 'No puedes invitarte a ti mismo')

  // El referente debe estar activo.
  const referrerUser = await c.env.DB.prepare(
    `SELECT status FROM users WHERE id = ?1`,
  ).bind(referrer.user_id).first<{ status: string }>()
  if (!referrerUser || referrerUser.status !== 'ACTIVE') throw new HttpError(400, 'El patrocinador no esta activo')

  // Verificar ciclos (el referido no puede ser ya referente del patrocinador).
  const cycle = await c.env.DB.prepare(
    `SELECT id FROM referrals WHERE referrer_id = ?1 AND referred_id = ?2`,
  ).bind(user.id, referrer.user_id).first<{ id: number }>()
  if (cycle) throw new HttpError(400, 'Esta relacion crearia un ciclo')

  await c.env.DB.prepare(
    `INSERT INTO referrals (referrer_id, referred_id, level, created_at) VALUES (?1, ?2, 1, ?3)`,
  ).bind(referrer.user_id, user.id, Date.now()).run()

  return c.json({ ok: true, referrerCode: code.trim().toUpperCase() })
})

/* ── GET /api/referrals/stats — estadisticas de la red del usuario ────────── */
referrals.get('/stats', async (c) => {
  const user = c.get('user')

  const [directCount, totalTree, totalEarned, available, pending] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?1`,
    ).bind(user.id).first<{ cnt: number }>(),
    // Total en la red (nivel 1 + nivel 2 + ...).
    c.env.DB.prepare(
      `WITH RECURSIVE tree(referred_id) AS (
         SELECT referred_id FROM referrals WHERE referrer_id = ?1
         UNION ALL
         SELECT r.referred_id FROM referrals r JOIN tree t ON r.referrer_id = t.referred_id
       ) SELECT COUNT(*) as cnt FROM tree`,
    ).bind(user.id).first<{ cnt: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) as total FROM referral_commissions WHERE user_id = ?1`,
    ).bind(user.id).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) as total FROM referral_commissions WHERE user_id = ?1 AND status = 'AVAILABLE'`,
    ).bind(user.id).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) as total FROM referral_commissions WHERE user_id = ?1 AND status = 'PENDING'`,
    ).bind(user.id).first<{ total: number }>(),
  ])

  return c.json({
    directReferrals: directCount?.cnt ?? 0,
    totalNetwork: totalTree?.cnt ?? 0,
    totalEarned: totalEarned?.total ?? 0,
    available: available?.total ?? 0,
    pending: pending?.total ?? 0,
  })
})

/* ── GET /api/referrals/tree — arbol de referidos (nivel 1) ───────────────── */
referrals.get('/tree', async (c) => {
  const user = c.get('user')
  const rows = await c.env.DB.prepare(
    `SELECT r.referred_id, r.created_at, u.username, u.first_name,
            (SELECT COUNT(*) FROM referrals WHERE referrer_id = r.referred_id) as children
     FROM referrals r
     JOIN users u ON u.id = r.referred_id
     WHERE r.referrer_id = ?1
     ORDER BY r.created_at DESC`,
  ).bind(user.id).all()

  return c.json({ items: rows.results ?? [] })
})

/* ── GET /api/referrals/commissions — historial de comisiones ─────────────── */
referrals.get('/commissions', async (c) => {
  const user = c.get('user')
  const page = Math.max(1, Number(c.req.query('page') ?? '1') || 1)
  const rows = await c.env.DB.prepare(
    `SELECT rc.id, rc.deposit_minor, rc.pct_bps, rc.amount_minor, rc.status, rc.created_at,
            u.username as referred_username, u.first_name as referred_name
     FROM referral_commissions rc
     JOIN users u ON u.id = rc.referred_user_id
     WHERE rc.user_id = ?1
     ORDER BY rc.created_at DESC
     LIMIT 21 OFFSET ?2`,
  ).bind(user.id, (page - 1) * 20).all()

  return c.json({ items: (rows.results ?? []).slice(0, 20), hasMore: (rows.results?.length ?? 0) > 20 })
})

export default referrals
