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
import { useT, useLanguageStore, localeFor } from '../../game/stores/languageStore'

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
  const t = useT()
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('admin.prev')}
      </button>
      <span>{t('admin.page', { page: String(page) })}</span>
      <button disabled={!hasMore} onClick={() => onPage(page + 1)}>
        {t('admin.next')}
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
  const t = useT()
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
            placeholder={t('admin.reason_placeholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        )}
        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>
            {t('admin.cancel')}
          </button>
          <button className={state.danger ? 'btn-danger' : 'btn-ok'} disabled={!canRun || busy} onClick={go}>
            {busy ? t('admin.processing') : state.confirmLabel}
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
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  if (loading) return <p className="muted">{t('admin.loading')}</p>
  return (
    <div>
      <ErrorBox error={error} />
      {data && (
        <>
          <div className="cards">
            <div className="card">
              <span className="card-num warn">{data.totals.pendingWithdrawals}</span>
              <span>{t('admin.dashboard.pendingWithdrawals')}</span>
            </div>
            <div className="card">
              <span className="card-num warn">{data.totals.pendingDeposits}</span>
              <span>{t('admin.dashboard.pendingDeposits')}</span>
            </div>
            <div className="card">
              <span className="card-num">{data.totals.totalUsers}</span>
              <span>{t('admin.dashboard.totalUsers')}</span>
            </div>
            <div className="card">
              <span className="card-num">{fmtMoney(data.totals.totalAvailableMinor)}</span>
              <span>{t('admin.dashboard.totalAvailable')}</span>
            </div>
            <div className="card">
              <span className="card-num">{fmtMoney(data.totals.totalReservedMinor)}</span>
              <span>{t('admin.dashboard.totalReserved')}</span>
            </div>
          </div>
          <h4>{t('admin.dashboard.recentOps')}</h4>
          <ul className="rows">
            {data.recentOps.map((op) => (
              <li key={`${op.kind}-${op.id}`} className="row">
                <span className={`kind kind-${op.kind}`}>
                  {op.kind === 'withdrawal' ? t('admin.dashboard.withdrawal') : t('admin.dashboard.deposit')}
                </span>
                <span className="grow">
                  @{op.username ?? op.telegramId} · {new Date(op.createdAt).toLocaleString(localeFor(lang))}
                </span>
                <b>{fmtMoney(op.amountMinor)}</b>
                <Badge status={op.status} />
              </li>
            ))}
            {data.recentOps.length === 0 && <li className="muted">{t('admin.dashboard.empty')}</li>}
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
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)

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
      {loading && <p className="muted">{t('admin.loading')}</p>}
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
                  {new Date(w.createdAt).toLocaleString(localeFor(lang))}
                </span>
                {w.denyReason && <span className="danger-text">{t('admin.withdrawal.reason', { reason: w.denyReason })}</span>}
                <div className="actions">
                  {w.status === 'PENDING' && (
                    <>
                      <button
                        className="btn-ok"
                        onClick={() =>
                          ask({
                            title: t('admin.withdrawal.approve_title'),
                            body: t('admin.withdrawal.approve_body', {
                              id: String(w.id),
                              amount: fmtMoney(w.amountMinor),
                              user: w.username ?? String(w.telegramId),
                            }),
                            confirmLabel: t('admin.withdrawal.approve'),
                            run: () => api.admin.approveWithdrawal(w.id),
                          })
                        }
                      >
                        {t('admin.withdrawal.approve')}
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() =>
                          ask({
                            title: t('admin.withdrawal.deny_title'),
                            body: t('admin.withdrawal.deny_body', {
                              id: String(w.id),
                              amount: fmtMoney(w.amountMinor),
                            }),
                            confirmLabel: t('admin.withdrawal.deny'),
                            danger: true,
                            requireReason: true,
                            run: (reason) => api.admin.denyWithdrawal(w.id, reason),
                          })
                        }
                      >
                        {t('admin.withdrawal.deny')}
                      </button>
                    </>
                  )}
                  {w.status === 'APPROVED' && (
                    <button
                      className="btn-ok"
                      onClick={() =>
                        ask({
                          title: t('admin.withdrawal.complete_title'),
                          body: t('admin.withdrawal.complete_body', {
                            id: String(w.id),
                            amount: fmtMoney(w.amountMinor),
                            dest: w.destinationMasked,
                          }),
                          confirmLabel: t('admin.withdrawal.complete_confirm'),
                          run: () => api.admin.completeWithdrawal(w.id),
                        })
                      }
                    >
                      {t('admin.withdrawal.complete_btn')}
                    </button>
                  )}
                </div>
              </li>
            ))}
            {data.items.length === 0 && <li className="muted">{t('admin.withdrawal.empty')}</li>}
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
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)

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
      {loading && <p className="muted">{t('admin.loading')}</p>}
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
                  #{d.id} · @{d.username ?? d.telegramId} · ref: {d.reference ?? '—'} · {new Date(d.createdAt).toLocaleString(localeFor(lang))}
                </span>
                {d.status === 'PENDING' && (
                  <div className="actions">
                    <button
                      className="btn-ok"
                      onClick={() =>
                        ask({
                          title: t('admin.deposit.approve_title'),
                          body: t('admin.deposit.approve_body', {
                            ref: d.reference ?? '',
                            amount: fmtMoney(d.amountMinor),
                            user: d.username ?? String(d.telegramId),
                          }),
                          confirmLabel: t('admin.deposit.approve_confirm'),
                          run: () => api.admin.approveDeposit(d.id),
                        })
                      }
                    >
                      {t('admin.deposit.approve')}
                    </button>
                    <button
                      className="btn-danger"
                      onClick={() =>
                        ask({
                          title: t('admin.deposit.cancel_title'),
                          body: t('admin.deposit.cancel_body', { id: String(d.id) }),
                          confirmLabel: t('admin.deposit.cancel_confirm'),
                          danger: true,
                          requireReason: true,
                          run: (reason) => api.admin.cancelDeposit(d.id, reason),
                        })
                      }
                    >
                      {t('admin.deposit.cancel')}
                    </button>
                  </div>
                )}
              </li>
            ))}
            {data.items.length === 0 && <li className="muted">{t('admin.deposit.empty')}</li>}
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
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)

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
      {sent !== null && <div className="ok-box">{t('admin.notif.sent', { id: String(sent) })}</div>}
      <ErrorBox error={error} />
      {!preview ? (
        <>
          <label className="field">
            {t('admin.notif.title')}
            <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </label>
          <label className="field">
            {t('admin.notif.message')}
            <textarea className="field-input" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5} />
          </label>
          <div className="form-grid">
            <label className="field">
              {t('admin.notif.type')}
              <select className="field-input" value={type} onChange={(e) => setType(e.target.value)}>
                {['GENERAL', 'MAINTENANCE', 'EVENT', 'FINANCIAL'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('admin.notif.priority')}
              <select className="field-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              {t('admin.notif.starts')}
              <input type="datetime-local" className="field-input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="field">
              {t('admin.notif.expires')}
              <input type="datetime-local" className="field-input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
          </div>
          <button disabled={!valid} onClick={() => setPreview(true)}>
            {t('admin.notif.preview')}
          </button>
        </>
      ) : (
        <>
          <div className="notif-preview">
            <b>{title}</b>
            <p>{message}</p>
            <span className="muted">
              {type} · {priority}
              {startsMs ? ` · ${t('admin.notif.from', { date: new Date(startsMs).toLocaleString(localeFor(lang)) })}` : ''}
              {expiresMs ? ` · ${t('admin.notif.until', { date: new Date(expiresMs).toLocaleString(localeFor(lang)) })}` : ''}
            </span>
          </div>
          <p className="muted">{t('admin.notif.preview_hint')}</p>
          <div className="actions">
            <button onClick={() => setPreview(false)}>{t('admin.notif.edit')}</button>
            <button className="btn-ok" disabled={busy} onClick={send}>
              {busy ? t('admin.notif.sending') : t('admin.notif.send_now')}
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
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)

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
        <input className="field-input" placeholder={t('admin.users.search_placeholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit">{t('admin.users.search')}</button>
      </form>
      <ErrorBox error={error} />
      {dialog}
      {loading && <p className="muted">{t('admin.loading')}</p>}
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
                  ID {u.telegramId} · {t('admin.users.created', { date: new Date(u.createdAt).toLocaleDateString(localeFor(lang)) })} ·{' '}
                  {t('admin.users.lastSeen', {
                    date: u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString(localeFor(lang)) : '—',
                  })}{' '}
                  · {t('admin.users.balance')} {fmtMoney(u.availableMinor ?? 0)}
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
                            title: t('admin.users.change_role_title', { role: r }),
                            body: t('admin.users.change_role_body', {
                              user: u.username ?? String(u.telegramId),
                              from: u.role,
                              to: r,
                            }),
                            confirmLabel: t('admin.users.confirm_role'),
                            run: () => api.admin.setUserRole(u.id, r),
                          })
                        }
                      >
                        {t('admin.users.make_role', { role: r })}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
            {data.items.length === 0 && <li className="muted">{t('admin.users.empty')}</li>}
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
  const t = useT()
  const lang = useLanguageStore((s) => s.lang)
  if (loading) return <p className="muted">{t('admin.loading')}</p>
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
                  <span className="muted">{new Date(a.createdAt).toLocaleString(localeFor(lang))}</span>
                </div>
                <span className="muted">
                  {t('admin.audit.by', {
                    user: a.actorUsername ?? String(a.actorTelegramId),
                    target: `${a.targetType}#${a.targetId}`,
                  })}
                  {a.reason ? ` · "${a.reason}"` : ''}
                </span>
              </li>
            ))}
            {data.items.length === 0 && <li className="muted">{t('admin.audit.empty')}</li>}
          </ul>
          <Pager page={page} hasMore={data.hasMore} onPage={setPage} />
        </>
      )}
    </div>
  )
}
