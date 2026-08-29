import { useEffect, useState } from 'react'
import { GameCanvas } from '../GameCanvas'
import { TopNav } from '../TopNav'
import { BottomBar } from '../BottomBar'
import { PanelHost } from '../panels/PanelHost'
import { NotificationCenter } from '../NotificationCenter'
import { AdminApp } from '../admin/AdminApp'
import { DepositPanel } from '../panels/DepositPanel'
import { useAuthStore } from '../../game/stores/authStore'
import { useUiStore } from '../../game/stores/uiStore'
import { useWalletStore } from '../../game/stores/walletStore'
import { detectTelegramEnvironment, type TelegramWebAppLike } from './telegramEnvironment'

/**
 * Juego completo: SOLO se monta cuando el gate confirma entorno Telegram.
 * Al montar notifica ready()/expand() al cliente y lanza la autenticación
 * EN BACKGROUND (useAuthStore.signIn → /api/me):
 * - Canvas2D se renderiza de inmediato, sin esperar al backend.
 * - rol ADMIN/SUPER_ADMIN → redirección automática al panel (con botón
 *   "Volver al juego").
 * - USER autenticado → juego normal + centro de notificaciones.
 * - unauthenticated/error → el juego funciona igual que siempre.
 */
function notifyTelegramReady(webApp: TelegramWebAppLike | null): void {
  if (!webApp) return
  try {
    webApp.ready?.()
    webApp.expand?.()
    webApp.setBackgroundColor?.('#79b356')
    webApp.setHeaderColor?.('#79b356')
  } catch {
    /* el cliente puede no soportarlas; nunca rompe el juego */
  }
}

export function GameApp() {
  const env = detectTelegramEnvironment()
  const status = useAuthStore((s) => s.status)
  const me = useAuthStore((s) => s.me)
  const signIn = useAuthStore((s) => s.signIn)
  const depositOpen = useUiStore((s) => s.depositOpen)
  const closeDeposits = useUiStore((s) => s.closeDeposits)
  const refreshWallet = useWalletStore((s) => s.refresh)
  const [screen, setScreen] = useState<'game' | 'admin'>('game')

  useEffect(() => {
    notifyTelegramReady(env.webApp)
  }, [env])

  useEffect(() => {
    void signIn()
  }, [signIn])

  // Saldo USDT: al autenticar, al enfocar la app (volver de aprobar un
  // depósito en otro dispositivo) y al cerrar el modal de depósitos.
  useEffect(() => {
    if (status === 'authenticated') void refreshWallet()
  }, [status, refreshWallet])

  useEffect(() => {
    const onFocus = (): void => {
      if (useAuthStore.getState().status === 'authenticated') void refreshWallet()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshWallet])

  useEffect(() => {
    if (!depositOpen && useAuthStore.getState().status === 'authenticated') void refreshWallet()
  }, [depositOpen, refreshWallet])

  useEffect(() => {
    if (status === 'authenticated' && me && me.user.role !== 'USER') setScreen('admin')
  }, [status, me])

  if (me && me.user.role !== 'USER' && screen === 'admin') {
    return <AdminApp me={me} onBackToGame={() => setScreen('game')} />
  }

  const isNormalUser = status === 'authenticated' && me?.user.role === 'USER'

  return (
    <div className="app-root">
      <GameCanvas />
      <TopNav />
      <PanelHost />
      <BottomBar />
      {/* Barra de sistema negra: la UI vive por encima de esta franja. */}
      <div className="system-bar" aria-hidden />
      {isNormalUser && screen === 'game' && <NotificationCenter initialUnread={me.unreadNotifications} />}
      {depositOpen && <DepositPanel onClose={closeDeposits} />}
    </div>
  )
}
