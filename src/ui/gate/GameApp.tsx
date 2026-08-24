import { useEffect } from 'react'
import { GameCanvas } from '../GameCanvas'
import { TopNav } from '../TopNav'
import { BottomBar } from '../BottomBar'
import { PanelHost } from '../panels/PanelHost'
import { detectTelegramEnvironment, type TelegramWebAppLike } from './telegramEnvironment'

/**
 * Juego completo: SOLO se monta cuando el gate confirma entorno Telegram.
 * Al montar notifica ready()/expand() al cliente (integración mínima;
 * NO incluye auth/login ni nada del gate antiguo).
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

  useEffect(() => {
    notifyTelegramReady(env.webApp)
  }, [env])

  return (
    <div className="app-root">
      <GameCanvas />
      <TopNav />
      <PanelHost />
      <BottomBar />
      {/* Barra de sistema negra: la UI vive por encima de esta franja. */}
      <div className="system-bar" aria-hidden />
    </div>
  )
}
