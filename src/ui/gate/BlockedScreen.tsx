import { TELEGRAM_APP_URL } from './telegramEnvironment'
import { useT } from '../../game/stores/languageStore'

/**
 * Pantalla de bloqueo fuera de Telegram: único render permitido cuando el
 * entorno no es Mini App. Sin canvas, sin HUD, sin barra, sin sistemas.
 */
export function BlockedScreen() {
  const t = useT()
  return (
    <div className="blocked-screen">
      <div className="blocked-card">
        <span className="blocked-title">Harvest Valley</span>
        <p className="blocked-text">
          {t('blocked.text')}
          <br />
          {t('blocked.sub')}
        </p>
        {TELEGRAM_APP_URL ? (
          <a className="blocked-cta" href={TELEGRAM_APP_URL} target="_blank" rel="noreferrer">
            {t('blocked.cta')}
          </a>
        ) : (
          <button type="button" className="blocked-cta blocked-cta-disabled" disabled title={t('blocked.text')}>
            {t('blocked.cta')}
          </button>
        )}
      </div>
    </div>
  )
}
