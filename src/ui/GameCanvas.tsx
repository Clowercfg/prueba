import { useEffect, useRef } from 'react'
import { ASSETS_CONFIG } from '../game/config/assetsConfig'
import { CONTENT_VIEW, getSafeArea, WORLD_BOUNDS } from '../game/config/layoutConfig'
import { GameLoop } from '../game/systems/GameLoop'
import { Camera2D } from '../game/systems/Camera2D'
import { Interaction } from '../game/systems/Interaction'
import { ResizeSystem } from '../game/systems/ResizeSystem'
import { TileSystem } from '../game/systems/TileSystem'
import { SpriteAssetManager } from '../game/assets/SpriteAssetManager'
import { createFarmEntities } from '../game/entities/farmEntities'
import { useGameStore } from '../game/stores/gameStore'
import { growthProgressOf, useCropStore } from '../game/stores/cropStore'
import { PLOT_PADS } from '../game/config/layoutConfig'
import { handleFarmTap } from '../game/systems/tapActions'
import { collectAnimalViews } from '../game/systems/animalViews'
import { startCropSystem } from '../game/systems/cropSystem'
import { startProcessingSystem } from '../game/systems/processingSystem'
import { startEconomySystem } from '../game/systems/economySystem'
import { tickAnimalAI } from '../game/systems/animalAI'
import { hydratePersistence, saveNow, startPersistence } from '../game/persistence/persistence'
import { Canvas2DRenderer } from '../renderer/canvas2d/Canvas2DRenderer'

const FPS_SAMPLE_MS = 500

/**
 * Host del canvas. CÃMARA COMPLETAMENTE FIJA (#25): el encuadre es el fit
 * portrait de toda la granja y NUNCA se libera â€” sin pan, sin pinch y sin
 * rueda (sÃ³lo tap de selecciÃ³n). En cada resize se recalcula el fit estÃ¡tico.
 * El fondo es pradera continua: nunca se ve espacio fuera del mapa. Los
 * assets cargan en background tras el primer frame y sustituyen los fallbacks.
 *
 * #24: sÃ³lo existe el motor canvas2d; ?engine=canvas2d se acepta explÃ­cito y
 * cualquier otro valor cae al mismo motor.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    void new URLSearchParams(window.location.search).get('engine') // aceptado: Ãºnico motor

    const store = useGameStore.getState()
    // Persistencia local: hidratación síncrona y ligera ANTES de arrancar
    // loop/sistemas (no espera assets ni red; save corrupto ⇒ estado inicial).
    hydratePersistence()
    store.setStatus('running')

    // Mundo: lÃ­mites REALES del terreno (#25) derivados de la banda activa.
    const camera = new Camera2D(WORLD_BOUNDS)
    camera.setViewport({ width: canvas.clientWidth || 1, height: canvas.clientHeight || 1 })

    const tiles = new TileSystem()
    const sprites = new SpriteAssetManager(ASSETS_CONFIG.baseUrl)
    const entities = createFarmEntities()

    // Estado REAL del juego â†’ renderer. Cultivos: progreso por parcela.
    // Animales: vistas visuales derivadas del registry (farmStore + AnimalAI).
    const hooks = {
      getGrowths: () => {
        const out = new Array<number>(PLOT_PADS.length).fill(0)
        for (const p of useCropStore.getState().planted) {
          if (p.plotIndex >= 0 && p.plotIndex < out.length) {
            out[p.plotIndex] = p.state === 'ready' ? 1 : growthProgressOf(p)
          }
        }
        return out
      },
      getAnimals: () => collectAnimalViews(),
    }

    const renderer = new Canvas2DRenderer(canvas, camera, tiles, sprites, entities, hooks)

    const platform = (window as unknown as { Telegram?: { WebApp?: { platform?: string } } }).Telegram?.WebApp?.platform
    const safeArea = getSafeArea(platform)

    // Encuadre estático: granja completa centrada en el rect útil (safe areas).
    // Se recalcula en cada resize; el usuario no puede alterarlo (#25).
    const fitFarmToViewport = (viewport: { width: number; height: number }): void => {
      camera.setViewport(viewport)
      camera.setFixedView({
        spanW: CONTENT_VIEW.spanW,
        spanH: CONTENT_VIEW.spanH,
        centerIso: CONTENT_VIEW.centerIso,
        insets: safeArea,
      })
    }

    const resize = new ResizeSystem(canvas, (viewport) => {
      renderer.resize(viewport)
      fitFarmToViewport(viewport)
    })

    // InteracciÃ³n (#20/#25): SOLO tap. Pan/pinch/rueda deshabilitados.
    // Las reglas de negocio viven en tapActions; aquÃ­ sÃ³lo el wiring:
    // Interaction (screenâ†’world) + hit-test del renderer inyectados.
    const interaction = new Interaction(
      canvas,
      camera,
      {
        onTap: (w) =>
          handleFarmTap({ pickAnimal: (wx, wy) => renderer.pickAnimal(wx, wy) }, w.x, w.y),
      },
      { pan: false, pinch: false, wheel: false },
    )

    // SelecciÃ³n â†’ highlight de escena (sin pasar por React).
    const syncHighlight = (): void => {
      renderer.setHighlight(useGameStore.getState().selection)
    }
    syncHighlight()
    const unsubStore = useGameStore.subscribe(syncHighlight)

    let frames = 0
    let fpsAccumMs = 0
    const loop = new GameLoop(
      (frame) => {
        tickAnimalAI(frame.delta) // IA de animales migrada (dt en segundos)
        camera.update(frame.delta)

        if (debug.firstFrame === null) debug.firstFrame = performance.now()

        frames += 1
        fpsAccumMs += frame.delta * 1000
        if (fpsAccumMs >= FPS_SAMPLE_MS) {
          const st = useGameStore.getState()
          st.setFps(Math.round((frames * 1000) / fpsAccumMs))
          const pos = camera.position
          st.setCamInfo({
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

    resize.attach() // aplica tamaÃ±o + encuadre antes del primer frame
    interaction.attach() // entrada disponible inmediatamente (#20)
    loop.start() // PRIMERO el juego; los assets van detrÃ¡s, nunca bloquean

    // Sistema de cultivos migrado: tick de 1 s sobre cropStore (crecimiento por horas reales).
    const stopCropSystem = startCropSystem()
    // Sistema de procesamiento migrado: tick de 1 s sobre processingStore (entrega de productos).
    const stopProcessingSystem = startProcessingSystem()
    // Sistema econÃ³mico migrado: recolecciÃ³n de producciÃ³n animal cada 4 s.
    const stopEconomySystem = startEconomySystem()
    // Persistencia local: debounce por cambios + visibilitychange/pagehide.
    const stopPersistence = startPersistence()

    // Precarga de crÃ­ticos en background: cuando termina quedan marcados para
    // verificar en tests que el primer frame fue ANTES de la carga completa.
    void sprites.preload(ASSETS_CONFIG.critical).then(() => {
      debug.criticalDone = performance.now()
    })

    // Handle de depuraciÃ³n temporal para tests headless; se elimina en fases futuras.
    const debug = {
      camera,
      tiles,
      renderer,
      sprites,
      entities,
      interaction,
      firstFrame: null as number | null,
      criticalDone: null as number | null,
    }
    ;(window as unknown as Record<string, unknown>).__HV = debug
    // Guardado manual para tests headless (la capa ya guarda sola).
    ;(debug as unknown as Record<string, unknown>).save = saveNow

    return () => {
      loop.stop()
      stopCropSystem()
      stopProcessingSystem()
      stopEconomySystem()
      stopPersistence()
      resize.detach()
      interaction.detach()
      unsubStore()
      renderer.dispose()
      delete (window as unknown as Record<string, unknown>).__HV
      useGameStore.getState().setStatus('stopped')
    }
  }, [])

  return <canvas ref={canvasRef} className="game-canvas" aria-label="Harvest Valley game" />
}
