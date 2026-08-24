/**
 * Panel de administración: shell con pestañas mobile-first.
 * Se monta automáticamente cuando /api/me reporta rol ADMIN o SUPER_ADMIN
 * (la decisión es server-side; el cliente sólo obedece).
 */

import { useState } from 'react'
import type { MeResponse } from '../../game/api/client'
import {
  AuditView,
  DashboardView,
  DepositsView,
  NotificationsView,
  UsersView,
  WithdrawalsView,
} from './views'

type Tab = 'dashboard' | 'withdrawals' | 'deposits' | 'notifications' | 'users' | 'audit'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'dashboard', label: 'Inicio' },
  { id: 'withdrawals', label: 'Retiros' },
  { id: 'deposits', label: 'Depósitos' },
  { id: 'notifications', label: 'Avisos' },
  { id: 'users', label: 'Usuarios' },
  { id: 'audit', label: 'Auditoría' },
]

export function AdminApp({ me, onBackToGame }: { me: MeResponse; onBackToGame: () => void }) {
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div className="admin-root">
      <header className="admin-header">
        <div>
          <h2>Panel Admin</h2>
          <span className={`badge role-${me.user.role.toLowerCase()}`}>{me.user.role}</span>
        </div>
        <button onClick={onBackToGame}>Volver al juego</button>
      </header>

      <main className="admin-main">
        {tab === 'dashboard' && <DashboardView />}
        {tab === 'withdrawals' && <WithdrawalsView />}
        {tab === 'deposits' && <DepositsView />}
        {tab === 'notifications' && <NotificationsView />}
        {tab === 'users' && <UsersView myRole={me.user.role} />}
        {tab === 'audit' && <AuditView />}
      </main>

      <nav className="admin-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
