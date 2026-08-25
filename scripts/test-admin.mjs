/**
 * Suite de verificación del backend admin contra `wrangler dev` local.
 * Ejecuta la matriz de pruebas de la especificación (§56-§64, §71).
 *
 * Uso: arrancar antes `npm run api:dev` y luego `npm run api:test`.
 * Firma initData reales con el BOT_TOKEN de worker/.dev.vars (mismo secreto),
 * así se ejercita el camino de autenticación real de Telegram.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'

const BASE = 'http://127.0.0.1:8787'

// ── carga el token de desarrollo ────────────────────────────────────────────
const devVars = fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
const BOT_TOKEN = devVars.match(/BOT_TOKEN=(.*)/)?.[1]?.trim()
if (!BOT_TOKEN) {
  console.error('Falta BOT_TOKEN en .dev.vars')
  process.exit(1)
}

// ── utilidades de firma (mismo algoritmo que Telegram) ──────────────────────
function signedInitData(tgUser) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify(tgUser),
  })
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
  return `${params}&hash=${hash}`
}

const SUPER = { id: 5563151323, username: 'valley_owner', first_name: 'Owner' }
const ALICE = { id: 111000111, username: 'alice_farmer', first_name: 'Alice' }
const BOB = { id: 222000222, username: 'bob_farmer', first_name: 'Bob' }

const init = {
  super: signedInitData(SUPER),
  alice: signedInitData(ALICE),
  bob: signedInitData(BOB),
}

async function call(path, { method = 'GET', as = 'super', body, initData } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(initData !== undefined ? { 'X-Telegram-Init-Data': initData } : { 'X-Telegram-Init-Data': init[as] }),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* sin cuerpo */
  }
  return { status: res.status, json }
}

let pass = 0
let fail = 0
const results = []
function check(name, ok, detail = '') {
  if (ok) pass++
  else fail++
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`)
  console.log(results[results.length - 1])
}

// espera salud del worker
for (let i = 0; i < 20; i++) {
  try {
    await fetch(`${BASE}/api/health`)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 500))
  }
}

/* ══ §56/57 detección de roles ══ */
{
  const me = await call('/api/me', { as: 'super' })
  check('TELEGRAM ADMIN DETECTION', me.status === 200 && me.json?.user?.role === 'SUPER_ADMIN', `role=${me.json?.user?.role}`)

  const alice = await call('/api/me', { as: 'alice' })
  check('ROLE SECURITY default USER', alice.status === 200 && alice.json?.user?.role === 'USER', `role=${alice.json?.user?.role}`)
}

/* ══ §58 telegram id falso (firma inválida) ══ */
{
  const forged = signedInitData(SUPER).replace(/hash=.*/, '') // quitar firma
  const r = await call('/api/me', { initData: forged })
  check('FAKE TELEGRAM ID rejected', r.status === 401, `status=${r.status}`)

  // usuario normal intentando endpoints admin
  const blocked = await call('/api/admin/withdrawals', { as: 'alice' })
  check('NORMAL USER BLOCKED (API 403)', blocked.status === 403, `status=${blocked.status}`)

  const notifBlocked = await call('/api/admin/notifications', { as: 'alice', method: 'POST', body: { title: 'x'.repeat(5), message: 'y'.repeat(10) } })
  check('USER SEND NOTIFICATION 403', notifBlocked.status === 403, `status=${notifBlocked.status}`)
}

/* ══ flujo financiero: depósito manual → aprobación admin ══ */
// línea base de alice para afirmaciones por DELTA (tests re-ejecutables)
const w0 = await call('/api/wallet', { as: 'alice' })
const usd0 = w0.json?.wallets?.find((w) => w.currency === 'USD') ?? { availableMinor: 0, reservedMinor: 0 }

{
  const ref = `tx-test-${Date.now()}`
  const dep = await call('/api/wallet/deposits', { as: 'alice', method: 'POST', body: { amountMinor: 50000, reference: ref } })
  check('deposit intent created', dep.status === 201 && dep.json?.id > 0)

  const list = await call('/api/admin/deposits?status=PENDING')
  const target = list.json?.items?.find((d) => d.reference === ref)
  check('WITHDRAWAL LIST analog: deposits list visible', Array.isArray(list.json?.items) && Boolean(target))

  const appr = await call(`/api/admin/deposits/${target.id}/approve`, { method: 'POST' })
  check('DEPOSIT APPROVE', appr.status === 200 && appr.json?.status === 'COMPLETED')

  const wallet = await call('/api/wallet', { as: 'alice' })
  const usd = wallet.json?.wallets?.find((w) => w.currency === 'USD')
  const credited = wallet.json?.ledger?.some((l) => l.type === 'DEPOSIT_CREDIT' && l.amountMinor === 50000)
  check('ledger +$500 tras aprobar', usd?.availableMinor === usd0.availableMinor + 50000 && credited === true, `available=${usd?.availableMinor}`)

  // §60 doble aprobación
  const again = await call(`/api/admin/deposits/${target.id}/approve`, { method: 'POST' })
  const wallet2 = await call('/api/wallet', { as: 'alice' })
  const still = wallet2.json?.wallets?.find((w) => w.currency === 'USD')?.availableMinor
  check('DOUBLE CREDIT PREVENTION', again.status === 409 && still === usd0.availableMinor + 50000, `status=${again.status}, balance=${still}`)
}

/* ══ retiros: reserva → aprobar → completar / denegar ══ */
{
  // §61 denegación con liberación de reservados
  const wd = await call('/api/wallet/withdrawals', {
    as: 'alice',
    method: 'POST',
    body: { amountMinor: 10000, method: 'TON', destination: 'UQD9t3wLmn4Kkk12qqqExampleAddress99887766' },
  })
  check('withdrawal created + reserved', wd.status === 201)

  const wList = await call('/api/admin/withdrawals?status=PENDING')
  const target = wList.json?.items?.[0]
  check('WITHDRAWAL LIST pending visible', Boolean(target))

  const midWallet = await call('/api/wallet', { as: 'alice' })
  const midUsd = midWallet.json?.wallets?.find((w) => w.currency === 'USD')
  check(
    'reserva mueve disponible→reservado',
    midUsd?.availableMinor === usd0.availableMinor + 40000 && midUsd?.reservedMinor === usd0.reservedMinor + 10000,
    `av=${midUsd?.availableMinor} rs=${midUsd?.reservedMinor}`,
  )

  const deny = await call(`/api/admin/withdrawals/${target.id}/deny`, { method: 'POST', body: { reason: 'duplicate request' } })
  check('WITHDRAWAL DENY', deny.status === 200 && deny.json?.status === 'DENIED')

  const afterDeny = await call('/api/wallet', { as: 'alice' })
  const dUsd = afterDeny.json?.wallets?.find((w) => w.currency === 'USD')
  const released = afterDeny.json?.ledger?.some((l) => l.type === 'WITHDRAWAL_RELEASE' && l.amountMinor === 10000)
  check(
    'deny devuelve reservados vía ledger',
    dUsd?.availableMinor === usd0.availableMinor + 50000 && dUsd?.reservedMinor === usd0.reservedMinor && released,
    `av=${dUsd?.availableMinor}`,
  )

  // doble denegación → 409
  const denyAgain = await call(`/api/admin/withdrawals/${target.id}/deny`, { method: 'POST', body: { reason: 'otra vez' } })
  check('idempotencia deny', denyAgain.status === 409, `status=${denyAgain.status}`)

  // aprobar → completar (dinero sale solo al confirmar envío real)
  const wd2 = await call('/api/wallet/withdrawals', {
    as: 'alice',
    method: 'POST',
    body: { amountMinor: 30000, method: 'TON', destination: 'UQCompleteThisOneLaterExampleAddress4433' },
  })
  const list2 = await call('/api/admin/withdrawals?status=PENDING')
  const t2 = list2.json?.items?.find((w) => w.amountMinor === 30000)

  // §62 concurrencia: dos admins aprueban a la vez
  const [r1, r2] = await Promise.all([
    call(`/api/admin/withdrawals/${t2.id}/approve`, { method: 'POST' }),
    call(`/api/admin/withdrawals/${t2.id}/approve`, { method: 'POST' }),
  ])
  const winners = [r1.status, r2.status].filter((s) => s === 200).length
  const conflicts = [r1.status, r2.status].filter((s) => s === 409).length
  check('DOUBLE PROCESSING un ganador', winners === 1 && conflicts === 1, `[${r1.status},${r2.status}]`)

  const complete = await call(`/api/admin/withdrawals/${t2.id}/complete`, { method: 'POST' })
  check('WITHDRAWAL complete settle', complete.status === 200)

  const endWallet = await call('/api/wallet', { as: 'alice' })
  const eUsd = endWallet.json?.wallets?.find((w) => w.currency === 'USD')
  check('settle saca los reservados', eUsd?.availableMinor === usd0.availableMinor + 20000 && eUsd?.reservedMinor === usd0.reservedMinor, `av=${eUsd?.availableMinor} rs=${eUsd?.reservedMinor}`)

  // completar dos veces → 409
  const completeAgain = await call(`/api/admin/withdrawals/${t2.id}/complete`, { method: 'POST' })
  check('idempotencia complete', completeAgain.status === 409, `status=${completeAgain.status}`)

  // saldo insuficiente rechazado limpio
  const poor = await call('/api/wallet/withdrawals', {
    as: 'alice',
    method: 'POST',
    body: { amountMinor: 999999, method: 'TON', destination: 'UQInsufficientFundsTestAddress000000111' },
  })
  check('saldo insuficiente → 400', poor.status === 400, `status=${poor.status}`)
}

/* ══ §63 notificaciones globales ══ */
{
  const created = await call('/api/admin/notifications', {
    method: 'POST',
    body: { title: 'Farm Update', message: 'Nueva temporada de siembra disponible para todos.', type: 'GENERAL', priority: 'NORMAL' },
  })
  check('GLOBAL NOTIFICATION created', created.status === 201)

  for (const who of ['alice', 'bob']) {
    const n = await call('/api/notifications', { as: who })
    const found = n.json?.items?.some((i) => i.title === 'Farm Update' && i.readAt === null)
    check(`notificación llega UNREAD a ${who}`, found === true, `unread=${n.json?.unread}`)
  }

  const bobItems = await call('/api/notifications', { as: 'bob' })
  const target = bobItems.json?.items?.find((i) => i.id === created.json?.id)
  check('bob ve el broadcast concreto', Boolean(target))
  await call(`/api/notifications/${created.json.id}/read`, { as: 'bob', method: 'POST' })

  const bobAfter = await call('/api/notifications', { as: 'bob' })
  const aliceNow = await call('/api/notifications', { as: 'alice' })
  const bobRead = bobAfter.json?.items?.find((i) => i.id === created.json.id)?.readAt !== null
  const aliceStillUnread = aliceNow.json?.items?.find((i) => i.id === created.json.id)?.readAt === null
  check('READ/UNREAD por usuario independiente', bobRead && aliceStillUnread)
}

/* ══ auditoría ══ */
{
  const audit = await call('/api/admin/audit')
  const actions = new Set(audit.json?.items?.map((a) => a.action))
  const needed = ['DEPOSIT_APPROVED', 'WITHDRAWAL_DENIED', 'WITHDRAWAL_COMPLETED', 'GLOBAL_NOTIFICATION_CREATED']
  const missing = needed.filter((a) => !actions.has(a))
  check('AUDIT LOG acciones registradas', missing.length === 0, missing.length ? `faltan: ${missing.join(',')}` : 'todas presentes')

  const dash = await call('/api/admin/dashboard')
  check('dashboard responde', dash.status === 200 && typeof dash.json?.totals?.totalUsers === 'number')

  // usuarios: búsqueda
  const users = await call('/api/admin/users?q=alice_farmer')
  check('búsqueda de usuarios', users.status === 200 && users.json?.items?.some((u) => u.username === 'alice_farmer'))
}

console.log('\n════════════════════════════════')
console.log(`RESULTADO: ${pass} PASS / ${fail} FAIL`)
process.exit(fail > 0 ? 1 : 0)
