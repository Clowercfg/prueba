/**
 * Middleware de autorización y rate limiting.
 * La seguridad vive SIEMPRE server-side: ocultar UI nunca es suficiente.
 */

import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { AppEnv, SessionUser } from './env'
import { HttpError, resolveUser, verifyInitData } from './auth'

/** Extrae initData crudo desde la cabecera estándar. */
export function getInitData(c: Context<AppEnv>): string | null {
  return c.req.header('X-Telegram-Init-Data') ?? null
}

/**
 * Autenticación: verifica firma + antigüedad del initData, resuelve/crea el
 * usuario interno y fija `c.var.user`. En DEV_MODE=1 (solo local) admite el
 * usuario sintético X-Dev-User cuando NO hay initData.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  let user: SessionUser | undefined

  const initData = getInitData(c)
  if (initData) {
    const result = await verifyInitData(initData, c.env.BOT_TOKEN)
    if (!result.ok) throw new HttpError(401, `initData inválido: ${result.reason}`)
    user = await resolveUser(c.env.DB, c.env, result.user)
  } else if (c.env.DEV_MODE === '1' && c.env.ENVIRONMENT !== 'production') {
    // Solo desarrollo local: usuario sintético explícito.
    const devId = c.req.header('X-Dev-User')
    if (devId) {
      user = await resolveUser(c.env.DB, c.env, {
        id: devId,
        username: `dev_${devId}`,
        first_name: `Dev ${devId}`,
        auth_date: Math.floor(Date.now() / 1000),
      })
    }
  }

  if (!user) throw new HttpError(401, 'No autenticado')
  c.set('user', user)
  await next()
})

/** Guardia de rol: exige ADMIN o SUPER_ADMIN según `minRole`. */
export const adminGuard = (minRole: 'ADMIN' | 'SUPER_ADMIN') =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user) throw new HttpError(401, 'No autenticado')
    const ok =
      minRole === 'ADMIN'
        ? user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
        : user.role === 'SUPER_ADMIN'
    if (!ok) throw new HttpError(403, 'Prohibido para tu rol')
    await next()
  })

/** Rate limit de ventana fija por clave (scope + identidad). */
export const rateLimit = (scope: string, limit: number, windowSeconds: number) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const identity = c.get('user')?.id ?? getInitData(c) ?? 'anon'
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds)
    const key = `${scope}:${identity}`
    const row = await c.env.DB.prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
      .bind(key, windowStart)
      .first<{ count: number }>()
    if ((row?.count ?? 0) > limit) throw new HttpError(429, 'Demasiadas peticiones')
    await next()
  })
