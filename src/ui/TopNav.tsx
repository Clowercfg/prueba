import { GAME_CONFIG } from '../game/config/gameConfig'
import { useGameStore } from '../game/stores/gameStore'
import { useEconomyStore } from '../game/stores/economyStore'
import { useUiStore } from '../game/stores/uiStore'
import { useT } from '../game/stores/languageStore'

/**
 * Franja superior única: navegación permanente + estado del juego.
 *   - Izquierda : botón IDIOMA  (abre sección 'language')
 *   - Derecha   : botón PERFIL  (abre sección 'profile'; futuro acceso
 *                 también a Referidos, cuya lógica NO se migra aún)
 *   - Centro    : saldo (monedas) y diamantes, datos existentes de
 *                 economyStore; sin estadísticas nuevas.
 * Reutiliza el overlay .hud existente (compacto, respeta safe-area) para
 * no crear una segunda barra. El resto del strip es pointer-events:none;
 * sólo los botones capturan toques. Los iconos son SVG inline ligeros.
 */

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function GlobeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.1-3.9-8.5S9.4 5.8 12 3.5Z" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-3.7 3.5-5.6 7-5.6s6.2 1.9 7 5.6" />
    </svg>
  )
}

function CoinIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="#f4b63f" />
      <circle cx="12" cy="12" r="5.2" fill="none" stroke="#a86f10" strokeWidth="2" />
    </svg>
  )
}

function GemIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.8 21 9.4 12 21.2 3 9.4Z" fill="#59c2f2" />
      <path d="M3 9.4h18M12 2.8l-3.4 6.6L12 21.2l3.4-11.8Z" fill="none" stroke="#1d7ba6" strokeWidth="1.4" />
    </svg>
  )
}

export function TopNav() {
  const t = useT()
  const gold = useEconomyStore((s) => s.gold)
  const diamonds = useEconomyStore((s) => s.diamonds)
  const fps = useGameStore((s) => s.fps)
  const status = useGameStore((s) => s.status)
  const camZoom = useGameStore((s) => s.camZoom)
  const camX = useGameStore((s) => s.camX)
  const camY = useGameStore((s) => s.camY)
  const tilesDrawn = useGameStore((s) => s.tilesDrawn)
  const toggleLanguage = useUiStore((s) => s.toggleSection)
  const toggleProfile = useUiStore((s) => s.toggleSection)

  return (
    <div className="hud">
      <button
        type="button"
        className="tn-btn tn-lang"
        aria-label={t('sidebar.language')}
        onClick={() => toggleLanguage('language')}
      >
        <GlobeIcon />
      </button>
      <span className="hud-title">{GAME_CONFIG.name}</span>
      <span className="hud-spacer" />
      <span className="hud-chip hud-gold" aria-label={t('shop.gold', { defaultValue: 'Monedas' })}>
        <CoinIcon />
        <b>{Math.floor(gold).toLocaleString('es')}</b>
      </span>
      <span className="hud-chip hud-gems" aria-label="Diamantes">
        <GemIcon />
        <b>{diamonds.toLocaleString('es')}</b>
      </span>
      <button
        type="button"
        className="tn-btn tn-profile"
        aria-label={t('sidebar.profile')}
        onClick={() => toggleProfile('profile')}
      >
        <UserIcon />
      </button>
      {import.meta.env.DEV && (
        <span className="hud-meta">
          {status} · {fps} fps · x{camZoom.toFixed(2)} · {camX.toFixed(1)},{camY.toFixed(1)} ·{' '}
          {tilesDrawn} tiles
        </span>
      )}
    </div>
  )
}
