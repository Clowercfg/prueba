/**
 * Vistas del panel de administración (mobile-first).
 * Cada vista es autónoma: carga sus datos, muestra errores y confirma las
 * acciones financieras antes de ejecutarlas (nada destructivo en 1 toque).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  api,
  fmtMoney,
  type AuditRow,
  type DepositRow,
  type Role,
  type UserAdminRow,
  type WithdrawalRow,
} from '../../game/api/client'

/* ── Componentes compartidos ─────────────────────────────────────────────── */

export function Badge({ status }: { status: string }) {
  const cls = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'COMPLETED', 'DENIED', 'CANCELLED'].includes(status)
    ? status.toLowerCase()
    : 'other'
  return <span className={`badge badge-${cls}`}>{status}</span>
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge role-${role.toLowerCase()}`}>{role}</span>
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof ApiError ? `${error.status}: ${error.message}` : String(error)
  return <div className="error-box">{msg}</div>
}

export function Pager({ page, hasMore, onPage }: { page: number; hasMore: boolean; onPage: (p: number) => void }) {
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ Anterior
      </button>
      <span>Pág. {page}</span>
      <button disabled={!hasMore} onClick={() => onPage(page + 1)}>
        Siguiente ›
      </button>
    </div>
  )
}

export interface ConfirmState {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  requireReason?: boolean
  run: (reason: string) => Promise<unknown>
}

export function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setReason(''), [state])
  if (!state) return null
  const s = state

  const canRun = !s.requireReason || reason.trim().length >= 3

  async function go() {
    setBusy(true)
    try {
      await s.run(reason.trim())
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{state.title}</h3>
        <p className="modal-body">{state.body}</p>
        {state.requireReason && (
          <textarea
            className="field-input"
            placeholder="Motivo obligatorio (mínimo 3 caracteres)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        )}
        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className={state.danger ? 'btn-danger' : 'btn-ok'} disabled={!canRun || busy} onClick={go}>
            {busy ? 'Procesando…' : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function useReload<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(() => {
    setLoading(true)
    loader()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch(setError)
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(reload, [reload])
  return { data, error, loading, reload }
}

/** Hook para acciones con confirmación que recargan la vista al terminar. */
function useAction(reload: () => void) {
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [actionError, setActionError] = useState<unknown>(null)
  function ask(state: Omit<ConfirmState, 'run'> & { run: (reason: string) => Promise<unknown> }) {
    setActionError(null)
    setConfirm({
      ...state,
      run: async (reason: string) => {
        try {
          await state.run(reason)
          reload()
        } catch (e) {
          setActionError(e)
          throw e
        }
      },
    })
  }
  const dialog = (
    <>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <ErrorBox error={actionError} />
    </>
  )
  return { ask, dialog }
}

/* ── Dashboard ───────────────────────────────────────────────────────────── */

export function DashboardView() {
  const { data, error, loading } = useReload(() => api.admin.dashboard(), [])
  if (loading) return <p className="muted">Cargando…</p>
  return (
    <div>
      <ErrorBox error={error} />
      {data && (
        <>
          <div className="cards">
            <div className="card">
              <span className="card-num warn">{data.totals.pendingWithdrawals}</span>
              <span>Retiros pendientes</span>
            </div>
            <div className="card">
              <span className="card-num warn">{data.totals.pendingDeposits}</span>
              <span>Depósitos por revisar</span>
            </div>
            <div className="card">
              <span className="card-num">{data.totals.totalUsers}</span>
              <span>Usuarios</span>
            </div>
            <div className="card">
              <span className="card-num">{fmtMoney(data.totals.totalAvailableMinor)}</span>
              <span>Disponible total</span>
            </div>
            <div className="card">
              <span className="card-num">{fmtMoney(data.totals.totalReservedMinor)}</span>
              <span>Reservado total</span>
            </div>
          </div>
          <h4>Operaciones recientes</h4>
          <ul className="rows">
            {data.recentOps.map((op) => (
              <li key={`${op.kind}-${op.id}`} className="row">
                <span className={`kind kind-${op.kind}`}>{op.kind === 'withdrawal' ? 'RETIRO' : 'DEPÓSITO'}</span>
                <span className="grow">
                  @{op.username ?? op.telegramId} · {new Date(op.createdAt).toLocaleString('es')}
                </span>
                <b>{fmtMoney(op.amountMinor)}</b>
                <Badge status={op.status} />
              </li>
            ))}
            {data.recentOps.length === 0 && <li className="muted">Sin operaciones todavía.</li>}
          </ul>
        </>
      )}
    </div>
  )
}

/* ── Retiros ─────────────────────────────────────────────────────────────── */

const W_STATUS = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'COMPLETED', 'DENIED', 'ALL']

export function WithdrawalsView() {
  const [status, setStatus] = useState('PENDING')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useReload(() => api.admin.withdrawals(status, page), [status, page])
  const { ask, dialog } = useAction(reload)

  return (
    <div>
      <div className="filter">
        <select className="field-input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          {W_STATUS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <ErrorBox error={error} />
      {dialog}
      {loading && <p className="muted">Cargando…</p>}
      {data && (
        <>
          <ul className="rows">
            {data.items.map((w: WithdrawalRow) => (
              <li key={w.id} className="row col">
                <div className="row-head">
                  <b>{fmtMoney(w.amountMinor)}</b>
                  <Badge status={w.status} />
                </div>
                <span className="muted">
                  #{w.id} · @{w.username ?? w.telegramId} · {w.method} → {w.destinationMasked} ·{' '}
                  {new Date(w.createdAt).toLocaleString('es')}
                </span>
                {w.denyReason && <span className="danger-text">Motivo: {w.denyReason}</span>}
                <div className="actions">
                  {w.status === 'PENDING' && (
                    <>
                      <button
                        className="btn-ok"
                        onClick={() =>
                          ask({
                            title: 'Aprobar retiro',
                            body: `Retiro #${w.id} de ${fmtMoney(w.amountMinor)} de @${w.username ?? w.telegramId}. El dinero sigue reservado hasta completar el envío.`,
                            confirmLabel: 'Aprobar',
                            run: () => api.admin.approveWithdrawal(w.id),
                          })
                        }
                      >
                        Aprobar
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() =>
                          ask({
                            title: 'Denegar retiro',
                            body: `Retiro #${w.id} de ${fmtMoney(w.amountMinor)}. Los fondos reservados volverán al saldo del usuario.`,
                            confirmLabel: 'Denegar',
                            danger: true,
                            requireReason: true,
                            run: (reason) => api.admin.denyWithdrawal(w.id, reason),
                          })
                        }
                      >
                        Denegar
                      </button>
                    </>
                  )}
                  {w.status === 'APPROVED' && (
                    <button
                      className="btn-ok"
                      onClick={() =>
                        ask({
                          title: 'Completar retiro',
                          body: `Confirma que el pago real del retiro #${w.id} (${fmtMoney(w.amountMinor)}) fue enviado a ${w.destinationMasked}. Esto liquida los fondos reservados.`,
                          confirmLabel: 'Pago enviado',
                          run: () => api.admin.completeWithdrawal(w.id),
                        })
                      }
                    >
                      Completar envío
                    </button>
                  )}
                </div>
              </li>
            ))}
            {data.items.length === 0 && <li className="muted">Nada aquí.</li>}
          </ul>
          <Pager page={page} hasMore={data.hasMore} onPage={setPage} />
        </>
      )}
    </div>
  )
}

/* ── Depósitos ───────────────────────────────────────────────────────────── */

export function DepositsView() {
  const [status, setStatus] = useState('PENDING')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useReload(() => api.admin.deposits(status, page), [status, page])
  const { ask, dialog } = useAction(reload)

  return (
    <div>
      <div className="filter">
        <select className="field-input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          {['PENDING', 'COMPLETED', 'CANCELLED', 'ALL'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <ErrorBox error={error} />
      {dialog}
      {loading && <p className="muted">Cargando…</p>}
      {data && (
        <>
          <ul className="rows">
            {data.items.map((d: DepositRow) => (
              <li key={d.id} className="row col">
                <div className="row-head">
                  <b>{fmtMoney(d.amountMinor)}</b>
                  <Badge status={d.status} />
                </div>
                <span className="muted">
                  #{d.id} · @{d.username ?? d.telegramId} · ref: {d.reference ?? '—'} · {new Date(d.createdAt).toLocaleString('es')}
                </span>
                {d.status === 'PENDING' && (
                  <div className="actions">
                    <button
                      className="btn-ok"
                      onClick={() =>
                        ask({
                          title: 'Aprobar depósito',
                          body: `¿Verificaste la transferencia ${d.reference ?? ''}? Se acreditarán ${fmtMoney(d.amountMinor)} a @${d.username ?? d.telegramId}.`,
                          confirmLabel: 'Acreditar',
                          run: () => api.admin.approveDeposit(d.id),
                        })
                      }
                    >
                      Aprobar
                    </button>
                    <button
                      className="btn-danger"
                      onClick={() =>
                        ask({
                          title: 'Cancelar depósito',
                          body: `El depósito #${d.id} quedará cancelado sin acreditar.`,
                          confirmLabel: 'Cancelar depósito',
                          danger: true,
                          requireReason: true,
                          run: (reason) => api.admin.cancelDeposit(d.id, reason),
                        })
                      }
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            ))}
            {data.items.length === 0 && <li className="muted">Nada aquí.</li>}
          </ul>
          <Pager page={page} hasMore={data.hasMore} onPage={setPage} />
        </>
      )}
    </div>
  )
}

/* ── Notificaciones globales ─────────────────────────────────────────────── */

export function NotificationsView() {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState('GENERAL')
  const [priority, setPriority] = useState('NORMAL')
  const [startsAt, setStartsAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [preview, setPreview] = useState(false)
  const [sent, setSent] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const startsMs = startsAt ? new Date(startsAt).getTime() : undefined
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : undefined
  const valid =
    title.trim().length >= 3 &&
    title.length <= 120 &&
    message.trim().length >= 3 &&
    message.length <= 2000 &&
    (!startsAt || Number.isFinite(startsMs)) &&
    (!expiresAt || Number.isFinite(expiresMs))

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const r = await api.admin.createNotification({
        title: title.trim(),
        message: message.trim(),
        type,
        priority,
        ...(startsMs !== undefined ? { startsAt: startsMs } : {}),
        ...(expiresMs !== undefined ? { expiresAt: expiresMs } : {}),
      })
      setSent(r.id)
      setTitle('')
      setMessage('')
      setStartsAt('')
      setExpiresAt('')
      setPreview(false)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form">
      {sent !== null && <div className="ok-box">Notificación #{sent} enviada a todos los usuarios activos.</div>}
      <ErrorBox error={error} />
      {!preview ? (
        <>
          <label className="field">
            Título
            <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </label>
          <label className="field">
            Mensaje
            <textarea className="field-input" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5} />
          </label>
          <div className="form-grid">
            <label className="field">
              Tipo
              <select className="field-input" value={type} onChange={(e) => setType(e.target.value)}>
                {['GENERAL', 'MAINTENANCE', 'EVENT', 'FINANCIAL'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Prioridad
              <select className="field-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              Publicar desde (opcional)
              <input type="datetime-local" className="field-input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="field">
              Expira (opcional)
              <input type="datetime-local" className="field-input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
          </div>
          <button disabled={!valid} onClick={() => setPreview(true)}>
            Vista previa
          </button>
        </>
      ) : (
        <>
          <div className="notif-preview">
            <b>{title}</b>
            <p>{message}</p>
            <span className="muted">
              {type} · {priority}
              {startsMs ? ` · desde ${new Date(startsMs).toLocaleString('es')}` : ''}
              {expiresMs ? ` · expira ${new Date(expiresMs).toLocaleString('es')}` : ''}
            </span>
          </div>
          <p className="muted">Se enviará a TODOS los usuarios activos. Revisa el texto antes de confirmar.</p>
          <div className="actions">
            <button onClick={() => setPreview(false)}>Editar</button>
            <button className="btn-ok" disabled={busy} onClick={send}>
              {busy ? 'Enviando…' : 'Enviar ahora'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Usuarios ────────────────────────────────────────────────────────────── */

export function UsersView({ myRole }: { myRole: Role }) {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useReload(() => api.admin.users(query, page), [query, page])
  const { ask, dialog } = useAction(reload)

  return (
    <div>
      <form
        className="filter"
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setQuery(q.trim())
        }}
      >
        <input className="field-input" placeholder="Buscar por usuario o ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit">Buscar</button>
      </form>
      <ErrorBox error={error} />
      {dialog}
      {loading && <p className="muted">Cargando…</p>}
      {data && (
        <>
          <ul className="rows">
            {data.items.map((u: UserAdminRow) => (
              <li key={u.id} className="row col">
                <div className="row-head">
                  <b>@{u.username ?? u.telegramId}</b>
                  <RoleBadge role={u.role} />
                </div>
                <span className="muted">
                  ID {u.telegramId} · alta {new Date(u.createdAt).toLocaleDateString('es')} · última vez{' '}
                  {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString('es') : '—'} · saldo{' '}
                  {fmtMoney(u.availableMinor ?? 0)}
                </span>
                {myRole === 'SUPER_ADMIN' && u.role !== myRole && (
                  <div className="actions">
                    {(u.role === 'USER'
                      ? (['ADMIN'] as Role[])
                      : (['USER'] as Role[])
                    ).map((r) => (
                      <button
                        key={r}
                        onClick={() =>
                          ask({
                            title: `Cambiar rol a ${r}`,
                            body: `@${u.username ?? u.telegramId} pasará de ${u.role} a ${r}. Queda registrado en auditoría.`,
                            confirmLabel: 'Confirmar rol',
                            run: () => api.admin.setUserRole(u.id, r),
                          })
                        }
                      >
                        Hacer {r}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
            {data.items.length === 0 && <li className="muted">Sin resultados.</li>}
          </ul>
          <Pager page={page} hasMore={data.hasMore} onPage={setPage} />
        </>
      )}
    </div>
  )
}

/* ── Auditoría ───────────────────────────────────────────────────────────── */

export function AuditView() {
  const [page, setPage] = useState(1)
  const { data, error, loading } = useReload(() => api.admin.audit('', page), [page])
  if (loading) return <p className="muted">Cargando…</p>
  return (
    <div>
      <ErrorBox error={error} />
      {data && (
        <>
          <ul className="rows">
            {data.items.map((a: AuditRow) => (
              <li key={a.id} className="row col">
                <div className="row-head">
                  <b>{a.action}</b>
                  <span className="muted">{new Date(a.createdAt).toLocaleString('es')}</span>
                </div>
                <span className="muted">
                  por @{a.actorUsername ?? a.actorTelegramId} sobre {a.targetType}#{a.targetId}
                  {a.reason ? ` · "${a.reason}"` : ''}
                </span>
              </li>
            ))}
            {data.items.length === 0 && <li className="muted">Sin registros.</li>}
          </ul>
          <Pager page={page} hasMore={data.hasMore} onPage={setPage} />
        </>
      )}
    </div>
  )
}
