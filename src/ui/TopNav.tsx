import { GAME_CONFIG } from '../game/config/gameConfig'
import { useGameStore } from '../game/stores/gameStore'
import { useUiStore } from '../game/stores/uiStore'
import { useT } from '../game/stores/languageStore'

/**
 * Franja superior única: navegación permanente + info de verificación.
 *   - Izquierda : botón IDIOMA  (abre sección 'language')
 *   - Derecha   : botón PERFIL  (abre sección 'profile'; futuro acceso
 *                 también a Referidos, cuya lógica NO se migra aún)
 * Reutiliza el overlay .hud existente (compacto, respeta safe-area) para
 * no crear una segunda barra superior. El resto del strip es
 * pointer-events:none; sólo los botones capturan toques.
 */
export function TopNav() {
  const t = useT()
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
        🌐
      </button>
      <span className="hud-title">{GAME_CONFIG.name}</span>
      <span className="hud-meta">
        {status} · {fps} fps · x{camZoom.toFixed(2)} · {camX.toFixed(1)},{camY.toFixed(1)} ·{' '}
        {tilesDrawn} tiles
      </span>
      <button
        type="button"
        className="tn-btn tn-profile"
        aria-label={t('sidebar.profile')}
        onClick={() => toggleProfile('profile')}
      >
        👤
      </button>
    </div>
  )
}
