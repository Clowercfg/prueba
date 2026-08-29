import { GameApp } from './ui/gate/GameApp'
import { BlockedScreen } from './ui/gate/BlockedScreen'
import { detectTelegramEnvironment } from './ui/gate/telegramEnvironment'

/**
 * Gate raíz: la decisión de entorno ocurre ANTES de instanciar cualquier
 * parte del juego. Fuera de Telegram no se crea GameCanvas, por lo que su
 * effect nunca corre y con él ni GameLoop.start() ni los timers de
 * CropSystem/ProcessingSystem/EconomySystem llegan a existir.
 */
export default function App() {
  const env = detectTelegramEnvironment()
  if (import.meta.env.DEV) {
    console.log(`[GATE] decision=${env.isTelegram ? 'telegram' : 'external'} (${env.reason})`)
  }
  return env.isTelegram ? <GameApp /> : <BlockedScreen />
}
