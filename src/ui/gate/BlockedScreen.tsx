import { TELEGRAM_APP_URL } from './telegramEnvironment'

/**
 * Pantalla de bloqueo fuera de Telegram: único render permitido cuando el
 * entorno no es Mini App. Sin canvas, sin HUD, sin barra, sin sistemas.
 */
export function BlockedScreen() {
  return (
    <div className="blocked-screen">
      <div className="blocked-card">
        <span className="blocked-title">Harvest Valley</span>
        <p className="blocked-text">
          Este juego solo está disponible dentro de Telegram.
          <br />
          Abre Harvest Valley desde Telegram para jugar.
        </p>
        {TELEGRAM_APP_URL ? (
          <a className="blocked-cta" href={TELEGRAM_APP_URL} target="_blank" rel="noreferrer">
            ABRIR EN TELEGRAM
          </a>
        ) : (
          <button type="button" className="blocked-cta blocked-cta-disabled" disabled title="Configura la URL oficial del Mini App">
            ABRIR EN TELEGRAM
          </button>
        )}
      </div>
    </div>
  )
}
