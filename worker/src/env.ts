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
  /** Secreto alfanumérico (A-Z a-z 0-9 _ -) que Telegram refleja en el header
   *  X-Telegram-Bot-Api-Secret-Token del webhook. El BOT_TOKEN no sirve:
   *  contiene ':' y Telegram lo rechaza como secret_token. */
  BOT_WEBHOOK_SECRET?: string
  /** IDs de Telegram (csv) promovidos a ADMIN en el bootstrap inicial */
  ADMIN_TELEGRAM_IDS?: string
  /** IDs de Telegram (csv) promovidos a SUPER_ADMIN en el bootstrap inicial */
  SUPER_ADMIN_TELEGRAM_IDS?: string
  /** '1' permite usuarios sintéticos X-Dev-User SOLO en desarrollo local */
  DEV_MODE?: string
  /** Marcado como 'production' en el despliegue real */
  ENVIRONMENT?: string
  /** Datos mostrados en el apartado de depósitos (config del proyecto anterior) */
  DEPOSIT_WALLET_ADDRESS?: string
  DEPOSIT_NETWORK?: string
  DEPOSIT_TELEGRAM?: string
  /** URL de la Mini App de Harvest Valley (dominio registrado en BotFather)
   *  usada por el botón PLAY del mensaje /start del bot. */
  MINI_APP_URL?: string
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
