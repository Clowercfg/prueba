/**
 * Panel de administración: shell con pestañas mobile-first.
 * Se monta automáticamente cuando /api/me reporta rol ADMIN o SUPER_ADMIN
 * (la decisión es server-side; el cliente sólo obedece).
 */

import { useState } from 'react'
import type { MeResponse } from '../../game/api/client'
import { useT } from '../../game/stores/languageStore'
import {
  AuditView,
  DashboardView,
  DepositsView,
  NotificationsView,
  UsersView,
  WithdrawalsView,
} from './views'

type Tab = 'dashboard' | 'withdrawals' | 'deposits' | 'notifications' | 'users' | 'audit'

const TAB_KEYS: Record<Tab, string> = {
  dashboard: 'admin.tabs.dashboard',
  withdrawals: 'admin.tabs.withdrawals',
  deposits: 'admin.tabs.deposits',
  notifications: 'admin.tabs.notifications',
  users: 'admin.tabs.users',
  audit: 'admin.tabs.audit',
}

export function AdminApp({ me, onBackToGame }: { me: MeResponse; onBackToGame: () => void }) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('dashboard')

  return (
    <div className="admin-root">
      <header className="admin-header">
        <div>
          <h2>{t('admin.title')}</h2>
          <span className={`badge role-${me.user.role.toLowerCase()}`}>{me.user.role}</span>
        </div>
        <button onClick={onBackToGame}>{t('admin.back_to_game')}</button>
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
        {(Object.keys(TAB_KEYS) as Tab[]).map((id) => (
          <button key={id} className={id === tab ? 'active' : ''} onClick={() => setTab(id)}>
            {t(TAB_KEYS[id])}
          </button>
        ))}
      </nav>
    </div>
  )
}
