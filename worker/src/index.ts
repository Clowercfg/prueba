/**
 * Harvest Valley API — Cloudflare Worker (Hono + D1).
 * Autenticación: initData de Telegram firmado, verificada server-side.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './env'
import { HttpError } from './auth'
import { requireAuth } from './middleware'
import meRoutes from './routes/me'
import walletRoutes from './routes/wallet'
import userNotifications from './routes/notifications'
import adminRoutes, { superAdmin } from './routes/admin'

const app = new Hono<AppEnv>()

// Mismo origen en dev (proxy de Vite); en producción se sirve desde el dominio
// del worker o Pages. La auth va por cabecera, no por cookies.
app.use(
  '/api/*',
  cors({
    origin: (o) => o ?? '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Telegram-Init-Data', 'X-Dev-User'],
    maxAge: 86400,
  }),
)

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 401)
  console.error('internal:', err)
  return c.json({ error: 'internal_error' }, 500)
})

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))

app.route('/api/me', meRoutes)
app.route('/api/wallet', walletRoutes)
app.route('/api/notifications', userNotifications)

// Grupo admin: autenticación + rol verificados server-side para TODAS las rutas.
app.use('/api/admin/*', requireAuth)
app.route('/api/admin', adminRoutes)
app.route('/api/admin', superAdmin)

export default app
