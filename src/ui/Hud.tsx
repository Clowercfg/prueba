import { GAME_CONFIG } from '../game/config/gameConfig'
import { useGameStore } from '../game/stores/gameStore'

/** Overlay mínimo de verificación (fps, zoom, cámara, culling). Temporal. */
export function Hud() {
  const fps = useGameStore((s) => s.fps)
  const status = useGameStore((s) => s.status)
  const camZoom = useGameStore((s) => s.camZoom)
  const camX = useGameStore((s) => s.camX)
  const camY = useGameStore((s) => s.camY)
  const tilesDrawn = useGameStore((s) => s.tilesDrawn)

  return (
    <div className="hud">
      <span className="hud-title">{GAME_CONFIG.name}</span>
      <span className="hud-meta">
        {status} · {fps} fps · x{camZoom.toFixed(2)} · {camX.toFixed(1)},{camY.toFixed(1)} ·{' '}
        {tilesDrawn} tiles
      </span>
    </div>
  )
}
