/**
 * Telegram Bot API — webhook de comandos del bot de Harvest Valley.
 *
 * Es la única ruta pensada para que Telegram llame al worker: recibe los
 * updates vía POST /webhook y responde 200 siempre (Telegram reintenta si
 * detecta timeout), procesando únicamente `/start`.
 *
 * Seguridad:
 *  - Todo sale de env vars: BOT_TOKEN (secreto ya existente) y MINI_APP_URL.
 *  - Valida el header X-Telegram-Bot-Api-Secret-Token contra BOT_TOKEN (el
 *    mismo valor que se registra con setWebhook) para rechazar llamadas ajenas.
 *  - Nunca imprime el token; los logs solo llevan chat_id y código de estado.
 */

import type { Context } from 'hono'
import type { AppEnv, Env } from './env'
import { HttpError } from './auth'

const TG_API_URL = 'https://api.telegram.org'

export const WELCOME_MESSAGE =
  '🌾 ¡Bienvenido a Harvest Valley!\n\nConstruye tu granja, cultiva, cría animales y comienza tu aventura. 🚜🐄\n\n🎮 ¡Pulsa el botón de abajo para jugar!'

export const PLAY_BUTTON_TEXT = '🌾 PLAY HARVEST VALLEY'

/**
 * Detecta un comando `/start` (con o sin mención del bot, ej. `/start@bot`)
 * y devuelve el payload opcional (`/start referral_code` → `"referral_code"`, o
 * `""` si no trae parámetros). Devuelve null si el texto NO es `/start`.
 * El payload se conserva para futuras funciones de referidos (aún sin lógica).
 */
export function startPayload(text: string): string | null {
  const m = /^\s*\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?\s*$/.exec(text)
  if (!m) return null
  return m[1] ?? ''
}

/** Botón de Mini App (web_app, no enlace de texto) para abrir Harvest Valley. */
export function welcomeReplyMarkup(miniAppUrl: string | null): Record<string, unknown> | null {
  if (!miniAppUrl) return null
  return { inline_keyboard: [[{ text: PLAY_BUTTON_TEXT, web_app: { url: miniAppUrl } }]] }
}

/** Envía el mensaje de bienvenida con el botón PLAY (método oficial sendMessage). */
async function sendWelcome(env: Env, chatId: number): Promise<void> {
  const res = await fetch(`${TG_API_URL}/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: WELCOME_MESSAGE,
      reply_markup: welcomeReplyMarkup(env.MINI_APP_URL ?? null),
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.log('[BOT] sendMessage falló:', res.status, detail.slice(0, 200))
  }
}

interface TelegramUpdate {
  message?: {
    chat?: { id?: number }
    text?: string
  }
}

export async function webhookHandler(c: Context<AppEnv>): Promise<Response> {
  // Firma del webhook: solo se aceptan updates del webhook registrado.
  const expected = c.env.BOT_WEBHOOK_SECRET ?? c.env.BOT_TOKEN
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token')
  if (!expected || !secret || secret !== expected) throw new HttpError(401, 'webhook token inválido')

  const body = (await c.req.json().catch(() => null)) as TelegramUpdate | null
  if (!body?.message) return c.text('ok')

  const chatId = body.message.chat?.id
  const text = body.message.text
  if (typeof chatId !== 'number' || typeof text !== 'string') return c.text('ok')

  // Payload de /start conservado en startPayload (referidos futuros); por
  // ahora el parámetro se acepta y se ignora con seguridad.
  if (startPayload(text) === null) return c.text('ok')

  console.log('[BOT] /start chatId:', chatId)
  try {
    await sendWelcome(c.env, chatId)
  } catch (e) {
    console.log('[BOT] error enviando welcome:', e instanceof Error ? e.message : e)
  }
  return c.text('ok')
}