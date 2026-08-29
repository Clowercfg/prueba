/**
 * Registra/consulta el webhook del bot de Harvest Valley.
 *
 * Uso:
 *   node scripts/set-webhook.mjs              → getWebhookInfo (solo lectura)
 *   node scripts/set-webhook.mjs <url>        → setWebhook <url> (con secret_token)
 *   node scripts/set-webhook.mjs --delete     → deleteWebhook
 *
 * El BOT_TOKEN se lee de la variable de entorno BOT_TOKEN o del .dev.vars
 * (nunca se imprime). El webhook usa el worker raíz: la URL pasada debe ser
 * la pública del deploy, p.ej. https://pruebafinal.fernandotopito437.workers.dev/webhook.
 *
 * El secret_token del webhook debe ser alfanumérico (A-Z a-z 0-9 _ -); se toma
 * de BOT_WEBHOOK_SECRET (env o .dev.vars). Nunca usar BOT_TOKEN: contiene ':' y
 * Telegram lo rechaza con "secret token contains illegal characters".
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadToken() {
  if (process.env.BOT_TOKEN) return process.env.BOT_TOKEN
  try {
    const raw = readFileSync(resolve(process.cwd(), '.dev.vars'), 'utf8')
    const m = /(?:^|\n)BOT_TOKEN=([^\r\n]+)/.exec(raw)
    if (m) return m[1].trim()
  } catch {
    /* sin .dev.vars: se usa solo env */
  }
  return null
}

function loadSecret() {
  if (process.env.BOT_WEBHOOK_SECRET) return process.env.BOT_WEBHOOK_SECRET
  try {
    const raw = readFileSync(resolve(process.cwd(), '.dev.vars'), 'utf8')
    const m = /(?:^|\n)BOT_WEBHOOK_SECRET=([^\r\n]+)/.exec(raw)
    if (m) return m[1].trim()
  } catch {
    /* sin .dev.vars: se usa solo env */
  }
  return null
}

const token = loadToken()
if (!token) {
  console.error('Falta BOT_TOKEN (env o .dev.vars)')
  process.exit(1)
}
if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(token)) {
  console.error('BOT_TOKEN con formato inválido')
  process.exit(1)
}

const secret = loadSecret()
if (secret && !/^[A-Za-z0-9_-]+$/.test(secret)) {
  console.error('BOT_WEBHOOK_SECRET debe ser alfanumérico (solo A-Z a-z 0-9 _ -)')
  process.exit(1)
}

const arg = process.argv[2]

async function call(name, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return res.json()
}

try {
  if (arg === '--delete') {
    const out = await call('deleteWebhook', {})
    console.log('deleteWebhook:', JSON.stringify({ ok: out.ok, description: out.description }))
  } else if (arg) {
    if (!arg.startsWith('https://')) {
      console.error('URL requerida (https://...) para setWebhook')
      process.exit(1)
    }
    if (!secret) {
      console.error('Falta BOT_WEBHOOK_SECRET (env o .dev.vars); es requerido como secret_token del webhook')
      process.exit(1)
    }
    const out = await call('setWebhook', {
      url: arg,
      secret_token: secret,
      drop_pending_updates: false,
    })
    console.log('setWebhook:', JSON.stringify({ ok: out.ok, description: out.description }))
  } else {
    const out = await call('getWebhookInfo', {})
    console.log('getWebhookInfo:', JSON.stringify(out.result ?? { ok: out.ok, description: out.description }))
  }
} catch (e) {
  console.error('Error:', e.message)
  process.exit(1)
}