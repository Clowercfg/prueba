import { useEffect, useRef } from 'react'
import { ASSETS_CONFIG } from '../game/config/assetsConfig'
import { CONTENT_VIEW, PADS, SAFE_AREA, WORLD_BOUNDS } from '../game/config/layoutConfig'
import { GameLoop } from '../game/systems/GameLoop'
import { Camera2D } from '../game/systems/Camera2D'
import { Interaction } from '../game/systems/Interaction'
import { ResizeSystem } from '../game/systems/ResizeSystem'
import { worldToTileIndex } from '../game/systems/isometricProjection'
import { TileSystem } from '../game/systems/TileSystem'
import { SpriteAssetManager } from '../game/assets/SpriteAssetManager'
import { createFarmEntities } from '../game/entities/farmEntities'
import { PLOT_KEYS, READY_AT, useGameStore, type PlotId } from '../game/stores/gameStore'
import { startCropSystem } from '../game/systems/cropSystem'
import { startProcessingSystem } from '../game/systems/processingSystem'
import { startEconomySystem } from '../game/systems/economySystem'
import { startVetSystem } from '../game/systems/vetSystem'
import { tickAnimalAI } from '../game/systems/animalAI'
import { Canvas2DRenderer } from '../renderer/canvas2d/Canvas2DRenderer'

const FPS_SAMPLE_MS = 500

const PLOT_PADS: ReadonlyArray<{ id: PlotId; pad: { x0: number; y0: number; x1: number; y1: number } }> =
  [
    { id: 'plotA', pad: PADS.plotA },
    { id: 'plotB', pad: PADS.plotB },
    { id: 'plotC', pad: PADS.plotC },
    { id: 'plotD', pad: PADS.plotD },
  ]

function tileInPad(
  i: number,
  j: number,
  pad: { x0: number; y0: number; x1: number; y1: number },
  inflate = 0,
): boolean {
  return i >= pad.x0 - inflate && i <= pad.x1 + inflate && j >= pad.y0 - inflate && j <= pad.y1 + inflate
}

/**
 * Resuelve un tap de mundo contra las reglas del juego (#20):
 *   parcela vacía → plantar · cultivo listo → cosechar ·
 *   animal/edificio → seleccionar · resto → deseleccionar.
 */
function handleFarmTap(renderer: Canvas2DRenderer, wx: number, wy: number): void {
  const store = useGameStore.getState()
  const { i, j } = worldToTileIndex(wx, wy)

  for (const { id, pad } of PLOT_PADS) {
    if (!tileInPad(i, j, pad)) continue
    const g = store.crops[id]
    if (g <= 0.001) {
      store.plantSeed(id)
    } else if (g >= READY_AT) {
      store.harvest(id)
      store.select({ kind: 'plot', id })
    } else {
      store.select({ kind: 'plot', id })
    }
    return
  }

  const animalId = renderer.pickAnimal(wx, wy)
  if (animalId) {
    store.select({ kind: 'animal', id: animalId })
    return
  }

  // Edificios: rectángulo del pad con un pequeño margen táctil.
  if (tileInPad(i, j, PADS.barn, 0.6)) {
    store.select({ kind: 'building', id: 'barn' })
    return
  }
  if (tileInPad(i, j, PADS.house, 0.6)) {
    store.select({ kind: 'building', id: 'house' })
    return
  }
  if (tileInPad(i, j, PADS.pen, 0.4)) {
    store.select({ kind: 'building', id: 'pen' })
    return
  }

  store.select(null)
}

/**
 * Host del canvas. CÁMARA COMPLETAMENTE FIJA (#25): el encuadre es el fit
 * portrait de toda la granja y NUNCA se libera — sin pan, sin pinch y sin
 * rueda (sólo tap de selección). En cada resize se recalcula el fit estático.
 * El fondo es pradera continua: nunca se ve espacio fuera del mapa. Los
 * assets cargan en background tras el primer frame y sustituyen los fallbacks.
 *
 * #24: sólo existe el motor canvas2d; ?engine=canvas2d se acepta explícito y
 * cualquier otro valor cae al mismo motor.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    void new URLSearchParams(window.location.search).get('engine') // aceptado: único motor

    const store = useGameStore.getState()
    store.setStatus('running')

    // Mundo: límites REALES del terreno (#25) derivados de la banda activa.
    const camera = new Camera2D(WORLD_BOUNDS)
    camera.setViewport({ width: canvas.clientWidth || 1, height: canvas.clientHeight || 1 })

    const tiles = new TileSystem()
    const sprites = new SpriteAssetManager(ASSETS_CONFIG.baseUrl)
    const entities = createFarmEntities()

    // Estado real de cultivos → banda de tierra (rebake por pasos visibles).
    const hooks = {
      getGrowths: () => {
        const crops = useGameStore.getState().crops
        return PLOT_KEYS.map((k) => crops[k])
      },
    }

    const renderer = new Canvas2DRenderer(canvas, camera, tiles, sprites, entities, hooks)

    // Encuadre estático: granja completa centrada en el rect útil (safe areas).
    // Se recalcula en cada resize; el usuario no puede alterarlo (#25).
    const fitFarmToViewport = (viewport: { width: number; height: number }): void => {
      camera.setViewport(viewport)
      camera.setFixedView({
        spanW: CONTENT_VIEW.spanW,
        spanH: CONTENT_VIEW.spanH,
        centerIso: CONTENT_VIEW.centerIso,
        insets: SAFE_AREA,
      })
    }

    const resize = new ResizeSystem(canvas, (viewport) => {
      renderer.resize(viewport)
      fitFarmToViewport(viewport)
    })

    // Interacción (#20/#25): SOLO tap. Pan/pinch/rueda deshabilitados.
    const interaction = new Interaction(
      canvas,
      camera,
      { onTap: (w) => handleFarmTap(renderer, w.x, w.y) },
      { pan: false, pinch: false, wheel: false },
    )

    // Selección → highlight de escena (sin pasar por React).
    const syncHighlight = (): void => {
      renderer.setHighlight(useGameStore.getState().selection)
    }
    syncHighlight()
    const unsubStore = useGameStore.subscribe(syncHighlight)

    let frames = 0
    let fpsAccumMs = 0
    const loop = new GameLoop(
      (frame) => {
        useGameStore.getState().tickCrops(frame.delta)
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

    resize.attach() // aplica tamaño + encuadre antes del primer frame
    interaction.attach() // entrada disponible inmediatamente (#20)
    loop.start() // PRIMERO el juego; los assets van detrás, nunca bloquean

    // Sistema de cultivos migrado: tick de 1 s sobre cropStore (crecimiento por horas reales).
    const stopCropSystem = startCropSystem()
    // Sistema de procesamiento migrado: tick de 1 s sobre processingStore (entrega de productos).
    const stopProcessingSystem = startProcessingSystem()
    // Sistema económico migrado: recolección de producción animal cada 4 s.
    const stopEconomySystem = startEconomySystem()
    // Sistema veterinario migrado: altas médicas + rollo de enfermedad (config).
    const stopVetSystem = startVetSystem()

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
      interaction,
      firstFrame: null as number | null,
      criticalDone: null as number | null,
    }
    ;(window as unknown as Record<string, unknown>).__HV = debug

    return () => {
      loop.stop()
      stopCropSystem()
      stopProcessingSystem()
      stopEconomySystem()
      stopVetSystem()
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
