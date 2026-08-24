/**
 * Verificación de identidad de Telegram (initData firmado con HMAC-SHA256)
 * y gestión del usuario interno + roles de bootstrap.
 *
 * El Telegram ID SIEMPRE se obtiene del initData validado; jamás se confía
 * en un telegramId enviado por el frontend.
 */

import type { Env, Role, SessionUser } from './env'

export interface TelegramUser {
  id: string
  username?: string
  first_name?: string
  last_name?: string
  language_code?: string
  auth_date: number
}

export type VerifyResult =
  | { ok: true; user: TelegramUser }
  | { ok: false; reason: 'missing' | 'bad_signature' | 'expired' }

/** Comparación en tiempo constante de strings hex. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const raw: ArrayBuffer = key instanceof Uint8Array ? (new Uint8Array(key).buffer as ArrayBuffer) : key
  const cryptoKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
}

/**
 * Valida initData siguiendo el algoritmo oficial:
 * secret_key = HMAC_SHA256(bot_token, "WebAppData")
 * hash       = HMAC_SHA256(secret_key, data_check_string)
 */
export async function verifyInitData(initData: string | null, botToken: string, maxAgeSeconds = 86400): Promise<VerifyResult> {
  if (!initData) return { ok: false, reason: 'missing' }

  const params = new URLSearchParams(initData)
  const providedHash = params.get('hash')
  if (!providedHash) return { ok: false, reason: 'bad_signature' }
  params.delete('hash')
  params.delete('signature')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), botToken)
  const computed = await hmac(secretKey, dataCheckString)
  const computedHex = [...new Uint8Array(computed)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (!safeEqual(computedHex, providedHash.toLowerCase())) return { ok: false, reason: 'bad_signature' }

  const authDate = Number(params.get('auth_date') ?? '0')
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return { ok: false, reason: 'expired' }

  const rawUser = params.get('user')
  if (!rawUser) return { ok: false, reason: 'bad_signature' }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawUser) as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'bad_signature' }
  }
  const id = parsed['id']
  if (typeof id !== 'number' && typeof id !== 'string') return { ok: false, reason: 'bad_signature' }

  return {
    ok: true,
    user: {
      id: String(id),
      username: typeof parsed['username'] === 'string' ? parsed['username'] : undefined,
      first_name: typeof parsed['first_name'] === 'string' ? parsed['first_name'] : undefined,
      last_name: typeof parsed['last_name'] === 'string' ? parsed['last_name'] : undefined,
      language_code: typeof parsed['language_code'] === 'string' ? parsed['language_code'] : undefined,
      auth_date: authDate,
    },
  }
}

function parseIdList(csv: string | undefined): Set<string> {
  return new Set((csv ?? '').split(',').map((s) => s.trim()).filter(Boolean))
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

interface UserRow {
  id: number
  telegram_id: string
  username: string | null
  first_name: string
  role: Role
  status: string
}

/** Inserta/actualiza el usuario interno y aplica bootstrap de roles si procede. */
export async function resolveUser(db: D1Database, env: Env, tUser: TelegramUser): Promise<SessionUser> {
  const now = Date.now()
  const row = await db
    .prepare(
      `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, COALESCE(?5, 'es'), ?6, ?6)
       ON CONFLICT(telegram_id) DO UPDATE SET
         username   = COALESCE(excluded.username, username),
         first_name = COALESCE(excluded.first_name, first_name),
         last_name  = COALESCE(excluded.last_name, last_name),
         updated_at = excluded.updated_at
       RETURNING id, telegram_id, username, first_name, role, status`,
    )
    .bind(tUser.id, tUser.username ?? null, tUser.first_name ?? null, tUser.last_name ?? null, tUser.language_code ?? null, now)
    .first<UserRow>()
  if (!row) throw new HttpError(500, 'No se pudo resolver el usuario')
  if (row.status !== 'ACTIVE') throw new HttpError(403, 'Usuario bloqueado')

  // Bootstrap seguro: la promoción solo ocurre si el telegramId validado está
  // en la lista de backend y el usuario aún es USER.
  let role = row.role as Role
  const supers = parseIdList(env.SUPER_ADMIN_TELEGRAM_IDS)
  const admins = parseIdList(env.ADMIN_TELEGRAM_IDS)
  if (role === 'USER' && (supers.has(tUser.id) || admins.has(tUser.id))) {
    role = supers.has(tUser.id) ? 'SUPER_ADMIN' : 'ADMIN'
    await db.batch([
      db.prepare(`UPDATE users SET role = ?2, updated_at = ?3 WHERE id = ?1`).bind(row.id, role, now),
      db.prepare(
        `INSERT INTO admin_audit_log
           (admin_user_id, action, target_user_id, old_status, new_status, metadata, created_at)
         VALUES (?1, 'BOOTSTRAP_ROLE_PROMOTED', ?1, 'USER', ?2, ?3, ?4)`,
      ).bind(row.id, role, JSON.stringify({ via: 'ADMIN_TELEGRAM_IDS bootstrap' }), now),
    ])
  }

  // Cartera por defecto (USD) si no existe
  await db
    .prepare(`INSERT OR IGNORE INTO wallets (user_id, currency, available_minor, reserved_minor, updated_at)
              VALUES (?1, 'USD', 0, 0, ?2)`)
    .bind(row.id, now)
    .run()

  // Backfill de notificaciones globales aún vigentes: usuarios creados después
  // del broadcast también deben verlo al abrir la app (estado leído individual).
  await db
    .prepare(
      `INSERT OR IGNORE INTO notification_receipts (notification_id, user_id)
       SELECT n.id, ?1 FROM notifications n
        WHERE (n.starts_at IS NULL OR n.starts_at <= ?2)
          AND (n.expires_at IS NULL OR n.expires_at > ?2)`,
    )
    .bind(row.id, now)
    .run()

  return {
    id: row.id,
    telegramId: row.telegram_id,
    username: row.username,
    firstName: row.first_name,
    role,
    status: row.status,
  }
}
