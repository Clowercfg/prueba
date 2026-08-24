import { useEffect, useState } from 'react'
import { GameCanvas } from '../GameCanvas'
import { TopNav } from '../TopNav'
import { BottomBar } from '../BottomBar'
import { PanelHost } from '../panels/PanelHost'
import { NotificationCenter } from '../NotificationCenter'
import { AdminApp } from '../admin/AdminApp'
import { api, type MeResponse } from '../../game/api/client'
import { detectTelegramEnvironment, type TelegramWebAppLike } from './telegramEnvironment'

/**
 * Juego completo: SOLO se monta cuando el gate confirma entorno Telegram.
 * Al montar notifica ready()/expand() al cliente y consulta /api/me:
 * - rol ADMIN/SUPER_ADMIN → redirección automática al panel (con botón
 *   "Volver al juego").
 * - USER → juego normal + centro de notificaciones si el backend responde.
 * Si el backend no está disponible el juego funciona igual que siempre.
 */
function notifyTelegramReady(webApp: TelegramWebAppLike | null): void {
  if (!webApp) return
  try {
    webApp.ready?.()
    webApp.expand?.()
  } catch {
    /* el cliente puede no soportarlas; nunca rompe el juego */
  }
}

export function GameApp() {
  const env = detectTelegramEnvironment()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [screen, setScreen] = useState<'game' | 'admin'>('game')

  useEffect(() => {
    notifyTelegramReady(env.webApp)
  }, [env])

  useEffect(() => {
    let alive = true
    api
      .me()
      .then((r) => {
        if (!alive) return
        setMe(r)
        if (r.user.role !== 'USER') setScreen('admin')
      })
      .catch(() => {
        /* sin backend: juego normal */
      })
    return () => {
      alive = false
    }
  }, [])

  if (me && me.user.role !== 'USER' && screen === 'admin') {
    return <AdminApp me={me} onBackToGame={() => setScreen('game')} />
  }

  return (
    <div className="app-root">
      <GameCanvas />
      <TopNav />
      <PanelHost />
      <BottomBar />
      {/* Barra de sistema negra: la UI vive por encima de esta franja. */}
      <div className="system-bar" aria-hidden />
      {me && me.user.role === 'USER' && screen === 'game' && <NotificationCenter initialUnread={me.unreadNotifications} />}
    </div>
  )
}
