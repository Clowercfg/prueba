/**
 * Detección del entorno Telegram Mini App (gate de acceso).
 *
 * Señal oficial: el cliente de Telegram inyecta window.Telegram.WebApp
 * antes de cargar la Mini App. Exigimos objeto + plataforma conocida +
 * API mínima (ready). El User-Agent NO se usa como prueba.
 *
 * LIMITACIÓN DOCUMENTADA (#8): este gate es una restricción de
 * interfaz/ejecución en cliente. La autenticidad criptográfica real
 * (validar initData firmado HMAC contra el bot token) corresponde a un
 * backend y quedará para la fase de autenticación.
 */

export interface TelegramWebAppLike {
  platform?: string
  initData?: string
  version?: string
  ready?: () => void
  expand?: () => void
}

interface TelegramWindow {
  Telegram?: { WebApp?: TelegramWebAppLike }
}

/** Plataformas reportadas por clientes Telegram oficiales. */
const KNOWN_PLATFORMS = new Set([
  'android',
  'ios',
  'macos',
  'tdesktop',
  'desktop',
  'weba',
  'webk',
  'web',
  'unofficial',
  'unknown',
])

/**
 * URL oficial de lanzamiento del Mini App (t.me/...).
 * Configurada por el propietario: bot @harvestvalley_bot.
 */
export const TELEGRAM_APP_URL: string | null = 'https://t.me/harvestvalley_bot'

export interface TelegramEnvironmentResult {
  /** true sólo si hay señales consistentes del cliente Telegram. */
  isTelegram: boolean
  /** Explicación corta de la decisión (para logs/diagnóstico). */
  reason: string
  /** WebApp real cuando exista (para ready()/expand()); null en sim/bloqueo. */
  webApp: TelegramWebAppLike | null
}

function inspect(w: TelegramWindow): TelegramEnvironmentResult {
  const wa = w?.Telegram?.WebApp
  if (!wa || typeof wa !== 'object') {
    return { isTelegram: false, reason: 'sin window.Telegram.WebApp', webApp: null }
  }
  const platform = typeof wa.platform === 'string' ? wa.platform : ''
  if (!platform || !KNOWN_PLATFORMS.has(platform)) {
    return { isTelegram: false, reason: `platform desconocida "${platform}"`, webApp: null }
  }
  if (typeof wa.ready !== 'function') {
    return { isTelegram: false, reason: 'WebApp sin API ready()', webApp: null }
  }
  return { isTelegram: true, reason: `platform=${platform}`, webApp: wa }
}

/**
 * Decide el entorno. Bypass de DESARROLLO: sólo compila dentro del guard
 * import.meta.env.DEV (Rollup lo elimina en producción); se activa con el
 * parámetro ?dev-telegram SOLO en el dev-server. En producción el bypass
 * no existe (ni por URL ni por storage).
 */
export function detectTelegramEnvironment(): TelegramEnvironmentResult {
  const w = window as unknown as TelegramWindow

  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('dev-telegram')) {
    return {
      isTelegram: true,
      reason: 'SIMULACIÓN dev (?dev-telegram)',
      webApp: { platform: 'android', initData: '', ready: () => {}, expand: () => {} },
    }
  }

  return inspect(w)
}
