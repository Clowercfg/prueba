/**
 * Tipos del entorno Cloudflare Worker.
 */

export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN'

export interface Env {
  /** Base de datos D1 */
  DB: D1Database
  /** Assets estáticos del frontend (dist) servidos por este mismo worker */
  ASSETS: Fetcher
  /** Bot token (secreto) usado para verificar la firma HMAC de initData */
  BOT_TOKEN: string
  /** IDs de Telegram (csv) promovidos a ADMIN en el bootstrap inicial */
  ADMIN_TELEGRAM_IDS?: string
  /** IDs de Telegram (csv) promovidos a SUPER_ADMIN en el bootstrap inicial */
  SUPER_ADMIN_TELEGRAM_IDS?: string
  /** '1' permite usuarios sintéticos X-Dev-User SOLO en desarrollo local */
  DEV_MODE?: string
  /** Marcado como 'production' en el despliegue real */
  ENVIRONMENT?: string
}

export interface SessionUser {
  id: number
  telegramId: string
  username: string | null
  firstName: string | null
  role: Role
  status: string
}

export interface AppEnv {
  Bindings: Env
  Variables: { user: SessionUser }
}
