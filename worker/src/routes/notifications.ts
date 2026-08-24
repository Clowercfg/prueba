/**
 * Centro de notificaciones del usuario final.
 * El estado READ/UNREAD es por usuario (notification_receipts).
 */

import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { HttpError } from '../auth'
import { requireAuth, rateLimit } from '../middleware'

const notifications = new Hono<AppEnv>()

notifications.use('*', requireAuth)

/** GET /api/notifications — visibles para mí (ventana starts/expires), no leídas primero. */
notifications.get('/', async (c) => {
  const user = c.get('user')
  const now = Date.now()
  const rows = await c.env.DB.prepare(
    `SELECT n.id, n.title, n.message, n.type, n.priority, n.created_at AS createdAt,
            r.read_at AS readAt
       FROM notification_receipts r
       JOIN notifications n ON n.id = r.notification_id
      WHERE r.user_id = ?1
        AND (n.starts_at IS NULL OR n.starts_at <= ?2)
        AND (n.expires_at IS NULL OR n.expires_at > ?2)
      ORDER BY r.read_at IS NOT NULL, n.priority = 'CRITICAL' DESC,
               n.priority = 'HIGH' DESC, n.created_at DESC
      LIMIT 50`,
  )
    .bind(user.id, now)
    .all()

  return c.json({
    items: rows.results ?? [],
    unread: (rows.results ?? []).filter((r) => (r as { readAt: number | null }).readAt === null).length,
  })
})

/** POST /api/notifications/:id/read — marca SOLO mi recibo como leído. */
notifications.post('/:id/read', rateLimit('notif-read', 60, 60), async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) throw new HttpError(400, 'id inválido')
  const result = await c.env.DB.prepare(
    `UPDATE notification_receipts SET read_at = ?3
      WHERE notification_id = ?1 AND user_id = ?2 AND read_at IS NULL`,
  )
    .bind(id, user.id, Date.now())
    .run()
  return c.json({ ok: true, changed: (result.meta.changes ?? 0) > 0 })
})

export default notifications
