/**
 * GET /api/me — identidad resuelta por el backend a partir del initData
 * firmado. El frontend NUNCA decide el rol: solo lee esta respuesta.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { requireAuth } from '../middleware'

const me = new Hono<AppEnv>()

me.get('/', requireAuth, async (c) => {
  const user = c.get('user')
  const [wallet, unread] = await Promise.all([
    c.env.DB.prepare(
      `SELECT currency, available_minor AS availableMinor, reserved_minor AS reservedMinor
         FROM wallets WHERE user_id = ?1`,
    )
      .bind(user.id)
      .all<{ currency: string; availableMinor: number; reservedMinor: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n
         FROM notification_receipts r
         JOIN notifications n ON n.id = r.notification_id
        WHERE r.user_id = ?1 AND r.read_at IS NULL
          AND (n.starts_at IS NULL OR n.starts_at <= ?2)
          AND (n.expires_at IS NULL OR n.expires_at > ?2)`,
    )
      .bind(user.id, Date.now())
      .first<{ n: number }>(),
  ])

  return c.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      role: user.role,
      status: user.status,
    },
    wallets: wallet.results ?? [],
    unreadNotifications: unread?.n ?? 0,
  })
})

export default me
