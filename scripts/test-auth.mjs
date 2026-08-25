/**
 * Suite de verificación de AUTENTICACIÓN de Telegram contra `wrangler dev` local.
 * Cubre la matriz del enunciado: usuario nuevo, no duplicación, telegram_id
 * único, initData inválida/expirada, sin credenciales y dev-user local.
 *
 * Uso: `npm run api:dev` arriba y luego `node scripts/test-auth.mjs`.
 * Firma initData real con el BOT_TOKEN de worker/.dev.vars (mismo secreto),
 * ejercitando el camino HMAC exacto de Telegram.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const BASE = 'http://127.0.0.1:8787'

const devVars = fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
const BOT_TOKEN = devVars.match(/BOT_TOKEN=(.*)/)?.[1]?.trim()
if (!BOT_TOKEN) {
  console.error('Falta BOT_TOKEN en .dev.vars')
  process.exit(1)
}

/* ── firma initData (mismo algoritmo que Telegram) ── */
function signedInitData(tgUser, { authDate = Math.floor(Date.now() / 1000), tamper = false } = {}) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    user: JSON.stringify(tgUser),
  })
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  let hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
  if (tamper) hash = hash.replace(/^./, hash[0] === '0' ? '1' : '0')
  return `${params}&hash=${hash}`
}

async function me(initData = null, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders }
  if (initData !== null) headers['X-Telegram-Init-Data'] = initData
  try {
    const res = await fetch(`${BASE}/api/me`, { headers })
    return { status: res.status, body: await res.json().catch(() => null) }
  } catch (e) {
    return { status: 0, body: null, netError: String(e) }
  }
}

async function d1(sql) {
  const out = execSync(
    `npx wrangler d1 execute harvest-valley-db --local --json --command "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' },
  )
  const parsed = JSON.parse(out.slice(out.indexOf('[')))
  return parsed[0]?.results ?? []
}

/* ── suite ── */
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// T1 health
{
  const r = await fetch(`${BASE}/api/health`)
  check('T1 health', r.status === 200)
}

const ALICE = { id: 911000111, username: 'alice_auth', first_name: 'Alice', last_name: 'Liddell' }

// T2 usuario nuevo → creado
let aliceId = null
{
  const r = await me(signedInitData(ALICE))
  aliceId = r.body?.user?.id ?? null
  check('T2 nuevo usuario creado', r.status === 200 && Number.isInteger(aliceId), `id=${aliceId}`)
}

// T3 login repetido → mismo usuario (no duplicado)
{
  const r = await me(signedInitData(ALICE))
  check('T3 relogin mismo id', r.status === 200 && r.body?.user?.id === aliceId)
}

// T4 dos solicitudes simultáneas → un solo usuario
{
  const [a, b] = await Promise.all([me(signedInitData(ALICE)), me(signedInitData(ALICE))])
  check('T4 race simultáneo mismo id', a.body?.user?.id === aliceId && b.body?.user?.id === aliceId)
  const rows = await d1(`SELECT COUNT(*) AS n FROM users WHERE telegram_id='${ALICE.id}'`)
  check('T4 UNIQUE telegram_id una fila', rows[0]?.n === 1, `rows=${rows[0]?.n}`)
}

// T5 firma alterada → rechazada
{
  const r = await me(signedInitData(ALICE, { tamper: true }))
  check('T5 hash alterado rechazado', r.status === 401, `status=${r.status}`)
}

// T6 auth_date expirada (>24h) → rechazada
{
  const old = Math.floor(Date.now() / 1000) - 90000
  const r = await me(signedInitData({ id: ALICE.id }, { authDate: old }))
  check('T6 initData expirada rechazada', r.status === 401, `status=${r.status}`)
}

// T7 sin cabecera → no autenticado
{
  const r = await me(null)
  check('T7 sin credenciales rechazado', r.status === 401, `status=${r.status} msg=${r.body?.error}`)
}

// T8 telegram_id "inventado" por el cliente sin firma válida → rechazado
{
  const r = await me(null, { 'X-Fake-Telegram-Id': String(ALICE.id) })
  check('T8 fake header ignorado', r.status === 401, `status=${r.status}`)
}

// T9 username cambia → mismo usuario actualizado (no duplicado)
{
  const renamed = { ...ALICE, username: 'alice_renamed' }
  await me(signedInitData(renamed))
  const rows = await d1(`SELECT username FROM users WHERE telegram_id='${ALICE.id}'`)
  check('T9 cambio de username actualiza', rows[0]?.username === 'alice_renamed')
}

// T10 last_name persistido (migración 0002)
{
  const rows = await d1(`SELECT last_name FROM users WHERE telegram_id='${ALICE.id}'`)
  check('T10 last_name guardado', rows[0]?.last_name === 'Liddell')
}

// T11 dev-user sintético SOLO local (DEV_MODE=1)
{
  const r = await me(null, { 'X-Dev-User': '777001' })
  check('T11 X-Dev-User local aceptado', r.status === 200 && Number.isInteger(r.body?.user?.id), `status=${r.status}`)
}

// T12 balance/rol jamás desde el cliente: el backend ignora el cuerpo
{
  const res = await fetch(`${BASE}/api/me`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dev-User': '777001' },
    body: JSON.stringify({ role: 'SUPER_ADMIN', balance: 999999 }),
  })
  const body = await res.json().catch(() => null)
  check('T12 rol/balance del cliente ignorados', res.status === 404 && body?.user?.role === undefined, `status=${res.status}`)
}

const fails = results.filter((r) => !r.ok)
console.log(`AUTH SUITE ${fails.length === 0 ? 'PASS' : 'FAIL'} total=${results.length} fallos=${fails.length}${fails.length ? ' -> ' + fails.map((f) => f.name).join(',') : ''}`)
process.exit(fails.length === 0 ? 0 : 1)
