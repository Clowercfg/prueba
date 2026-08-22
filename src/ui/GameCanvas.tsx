import { useEffect, useRef } from 'react'
import { MAP_CONFIG } from '../game/config/gameConfig'
import { ASSETS_CONFIG } from '../game/config/assetsConfig'
import { CONTENT_VIEW, SAFE_AREA } from '../game/config/layoutConfig'
import { GameLoop } from '../game/systems/GameLoop'
import { Camera2D } from '../game/systems/Camera2D'
import type { WorldBounds } from '../game/systems/Camera2D'
import { TileSystem } from '../game/systems/TileSystem'
import { ResizeSystem } from '../game/systems/ResizeSystem'
import { SpriteAssetManager } from '../game/assets/SpriteAssetManager'
import { createFarmEntities } from '../game/entities/farmEntities'
import { useGameStore } from '../game/stores/gameStore'
import { Canvas2DRenderer } from '../renderer/canvas2d/Canvas2DRenderer'

const FPS_SAMPLE_MS = 500

/**
 * Host del canvas. CÁMARA FIJA portrait: se calcula un único encuadre que
 * muestra la granja completa (fitFarmToViewport) y NO hay entrada de cámara:
 * sin pan, sin drag, sin pinch, sin rueda. Los sprites cargan en background
 * tras el primer frame y sustituyen los fallbacks.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const store = useGameStore.getState()
    store.setStatus('running')

    // Mundo: límites del mapa en coordenadas de mundo (1 unidad = 1 tile).
    const bounds: WorldBounds = {
      minX: 0,
      minY: 0,
      maxX: MAP_CONFIG.tilesX,
      maxY: MAP_CONFIG.tilesY,
    }

    const camera = new Camera2D(bounds)
    camera.setViewport({ width: canvas.clientWidth || 1, height: canvas.clientHeight || 1 })

    const tiles = new TileSystem()
    const sprites = new SpriteAssetManager(ASSETS_CONFIG.baseUrl)
    const entities = createFarmEntities()

    // Presentación pura: no ejecuta lógica de juego.
    const renderer = new Canvas2DRenderer(canvas, camera, tiles, sprites, entities)

    // fitFarmToViewport: zoom automático para ver TODA la granja, centrada
    // en el rect útil (safe areas arriba/abajo). Se recalcula en cada resize.
    const fitFarmToViewport = (viewport: { width: number; height: number }): void => {
      camera.setViewport(viewport)
      camera.setFixedView({
        spanW: CONTENT_VIEW.spanW,
        spanH: CONTENT_VIEW.spanH,
        centerIso: CONTENT_VIEW.centerIso,
        insets: SAFE_AREA,
      })
    }

    // Ajuste responsive + DPR (máx 2). Cada cambio re-aplica el encuadre fijo.
    const resize = new ResizeSystem(canvas, (viewport) => {
      renderer.resize(viewport)
      fitFarmToViewport(viewport)
    })

    let frames = 0
    let fpsAccumMs = 0
    const loop = new GameLoop(
      (frame) => {
        camera.update(frame.delta)

        if (debug.firstFrame === null) debug.firstFrame = performance.now()

        frames += 1
        fpsAccumMs += frame.delta * 1000
        if (fpsAccumMs >= FPS_SAMPLE_MS) {
          store.setFps(Math.round((frames * 1000) / fpsAccumMs))
          const pos = camera.position
          store.setCamInfo({
            zoom: camera.zoom,
            x: pos.x,
            y: pos.y,
            tilesDrawn: renderer.terrainStats.drawn,
          })
          frames = 0
          fpsAccumMs = 0
        }
      },
      (frame) => {
        renderer.render(frame.elapsed * 1000, frame.elapsed)
      },
    )

    resize.attach() // aplica tamaño + encuadre fijo antes del primer frame
    loop.start() // PRIMERO el juego; los assets van detrás, nunca bloquean

    // Precarga de críticos en background: cuando termina quedan marcados para
    // verificar en tests que el primer frame fue ANTES de la carga completa.
    void sprites.preload(ASSETS_CONFIG.critical).then(() => {
      debug.criticalDone = performance.now()
    })

    // Handle de depuración temporal para tests headless; se elimina en fases futuras.
    const debug = {
      camera,
      tiles,
      renderer,
      sprites,
      entities,
      firstFrame: null as number | null,
      criticalDone: null as number | null,
    }
    ;(window as unknown as Record<string, unknown>).__HV = debug

    return () => {
      loop.stop()
      resize.detach()
      renderer.dispose()
      delete (window as unknown as Record<string, unknown>).__HV
      useGameStore.getState().setStatus('stopped')
    }
  }, [])

  return <canvas ref={canvasRef} className="game-canvas" aria-label="Harvest Valley game" />
}
