import type { ViewportInfo } from '../../game/types'
import type { Camera2D } from '../../game/systems/Camera2D'
import type { TileSystem } from '../../game/systems/TileSystem'
import type { SpriteAssetManager } from '../../game/assets/SpriteAssetManager'
import type { FarmEntity } from '../../game/entities/farmEntities'
import type { Renderer } from '../Renderer'
import { SceneComposer, type ComposerHooks, type Highlight } from './scene/SceneComposer'
import { PAL } from './scene/palette'

/**
 * Renderer Canvas 2D de Harvest Valley.
 *
 * Bandas: cache estÃ¡tico de tierra â†’ blit â†’ objetos y-sorteados (sprites
 * horneados en ObjectSpriteCache) intercalados con animales â†’ ambiente â†’
 * grado de luz. Sin WebGL ni motores 3D: sÃ³lo Canvas2D (#15).
 */
export class Canvas2DRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly composer: SceneComposer

  private viewW = 1
  private viewH = 1
  private dpr = 1
  private lastElapsed = -1
  private lastPhysW = -1
  private lastPhysH = -1

  // MÃ©tricas (#15): primer draw y media mÃ³vil de frame.
  private readonly t0 = performance.now()
  private firstDrawMs = -1
  private frameEma = 0
  private frameCount = 0
  private perfEl: HTMLDivElement | null = null

  constructor(
    canvas: HTMLCanvasElement,
    camera: Camera2D,
    _tiles: TileSystem,
    sprites?: SpriteAssetManager | null,
    entities?: FarmEntity[] | null,
    hooks?: ComposerHooks,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) {
      throw new Error('Canvas2DRenderer: no se pudo obtener el contexto 2D')
    }
    this.ctx = ctx
    // #14: el SpriteSystem existente alimenta la escena; procedural = fallback.
    this.composer = new SceneComposer(camera, _tiles, entities ?? [], sprites ?? null, hooks)
  }

  /** SelecciÃ³n actual (halo pintado bajo objetos; no invalida caches). */
  setHighlight(h: Highlight): void {
    this.composer.setHighlight(h)
  }

  /** Hit-test de animales para la capa de interacciÃ³n (#20). */
  pickAnimal(wx: number, wy: number): string | null {
    return this.composer.pickAnimal(wx, wy)
  }

  resize(viewport: ViewportInfo): void {
    this.ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
    // Suavizado de calidad media: nÃ­tido sin coste excesivo en mÃ³vil (#19).
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'medium'
    this.viewW = Math.max(1, viewport.width)
    this.viewH = Math.max(1, viewport.height)
    this.dpr = viewport.dpr
  }

  get terrainStats(): { drawn: number; considered: number; total: number } {
    return this.composer.terrainStats
  }

  get objectStats(): { count: number; drawnLastFrame: number; drawOrder: number[] } {
    return this.composer.objectStats
  }

  get perf(): { firstDrawMs: number; frameMs: number; buildMs: number } {
    return {
      firstDrawMs: Math.round(this.firstDrawMs * 100) / 100,
      frameMs: Math.round(this.frameEma * 100) / 100,
      buildMs: this.composer.perfStats.buildMs,
    }
  }

  render(_frameTimeMs: number, elapsed: number): void {
    const { ctx } = this
    const tStart = performance.now()

    // dt interno (segundos) para capas animadas, acotado a 100 ms. Se sigue
    // registrando lastElapsed para futuras capas que necesiten dt.
    if (this.lastElapsed >= 0) {
      const dt = Math.min(0.1, Math.max(0, (elapsed - this.lastElapsed) / 1000))
      void dt
    }
    this.lastElapsed = elapsed
    // dt ya no se consume en el composer: la capa animal es espejo del estado real.
    this.composer.update()

    // Clear fÃ­sico solo cuando cambia el tamaÃ±o/DPR (#15): la banda de
    // suelo cacheada cubre siempre el viewport, pintar encima es opaco.
    const physW = ctx.canvas.width
    const physH = ctx.canvas.height
    if (physW !== this.lastPhysW || physH !== this.lastPhysH) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = PAL.meadow.lo
      ctx.fillRect(0, 0, physW, physH)
      ctx.restore()
      this.lastPhysW = physW
      this.lastPhysH = physH
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'medium'

    this.composer.ensureCache(this.viewW, this.viewH, this.dpr)
    this.composer.blit(ctx, this.viewW, this.viewH)
    this.composer.drawDynamic(ctx, elapsed, this.viewW, this.viewH)

    // MÃ©tricas.
    const frameDt = performance.now() - tStart
    if (this.firstDrawMs < 0) this.firstDrawMs = performance.now() - this.t0
    this.frameEma = this.frameEma === 0 ? frameDt : this.frameEma * 0.9 + frameDt * 0.1
    this.frameCount++
    this.updatePerfOverlay()
  }

  /** Overlay de rendimiento para verificaciÃ³n headless (?perf=1). */
  private updatePerfOverlay(): void {
    if (!/[?&]perf=1/.test(window.location.search)) return
    if (!this.perfEl) {
      this.perfEl = document.createElement('div')
      this.perfEl.id = 'hv-perf'
      this.perfEl.style.cssText =
        'position:fixed;top:4px;left:4px;z-index:99;font:10px monospace;color:#fff;' +
        'background:rgba(0,0,0,.55);padding:2px 6px;border-radius:4px;pointer-events:none;'
      document.body.appendChild(this.perfEl)
    }
    const p = this.perf
    const line = `first:${p.firstDrawMs}ms build:${p.buildMs}ms frame:${p.frameMs}ms`
    this.perfEl.textContent = line
    document.title = line
    if (this.frameCount <= 3 || this.frameCount === 120) {
      console.info(`[HV-perf] f${this.frameCount} ${line} objs:${this.objectStats.drawnLastFrame}`)
    }
  }

  dispose(): void {
    this.composer.dispose()
    this.perfEl?.remove()
    this.perfEl = null
  }
}
