/**
 * Centro de notificaciones del jugador: campana flotante con contador de
 * no leídas (dato de /api/me) y panel con la lista. Marcar como leído es
 * por usuario (receipts individuales en el backend).
 */

import { useEffect, useState } from 'react'
import { api, type NotificationRow } from '../game/api/client'

export function NotificationCenter({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(initialUnread)
  const [items, setItems] = useState<NotificationRow[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function load() {
    setError(null)
    try {
      const r = await api.notifications()
      setItems(r.items)
      setUnread(r.unread)
    } catch (e) {
      setError(e)
    }
  }

  useEffect(() => {
    if (open && items === null) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function markRead(n: NotificationRow) {
    try {
      await api.markNotificationRead(n.id)
      setItems((prev) => prev?.map((i) => (i.id === n.id ? { ...i, readAt: Date.now() } : i)) ?? null)
      setUnread((u) => Math.max(0, u - 1))
    } catch (e) {
      setError(e)
    }
  }

  return (
    <div className="notif-root">
      <button className="notif-bell" onClick={() => setOpen((o) => !o)} aria-label="Notificaciones">
        🔔{unread > 0 && <span className="notif-count">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <b>Notificaciones</b>
            <button onClick={() => setOpen(false)}>✕</button>
          </div>
          {error !== null && <div className="error-box">No se pudieron cargar.</div>}
          {!items && !error && <p className="muted">Cargando…</p>}
          {items && (
            <ul>
              {items.length === 0 && <li className="muted">Sin notificaciones.</li>}
              {items.map((n) => (
                <li key={n.id} className={n.readAt ? 'notif-item read' : 'notif-item'}>
                  <div className="row-head">
                    <b>{n.title}</b>
                    {!n.readAt && (
                      <button className="link" onClick={() => markRead(n)}>
                        Marcar leída
                      </button>
                    )}
                  </div>
                  <p>{n.message}</p>
                  <span className="muted">{new Date(n.sentAt).toLocaleString('es')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
