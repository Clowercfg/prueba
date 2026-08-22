import { RENDER_CONFIG } from '../../game/config/renderConfig'
import type { ViewportInfo } from '../../game/types'
import type { Camera2D } from '../../game/systems/Camera2D'
import type { TileSystem } from '../../game/systems/TileSystem'
import type { SpriteAssetManager } from '../../game/assets/SpriteAssetManager'
import type { FarmEntity } from '../../game/entities/farmEntities'
import { ObjectRenderer } from './ObjectRenderer'
import type { Renderer } from '../Renderer'
import { TerrainRenderer } from './TerrainRenderer'

/**
 * Renderer Canvas 2D. Solo presentación: no ejecuta lógica de juego.
 * Trabaja en CSS pixels (escala por DPR una vez en resize); la cámara aporta
 * worldToScreen y el TerrainRenderer decide qué tiles se dibujan (culling).
 */
export class Canvas2DRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly terrain: TerrainRenderer
  private readonly objects: ObjectRenderer | null
  private readonly sprites: SpriteAssetManager | null
  private readonly camera: Camera2D

  constructor(
    canvas: HTMLCanvasElement,
    camera: Camera2D,
    tiles: TileSystem,
    sprites?: SpriteAssetManager | null,
    entities?: FarmEntity[] | null,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) {
      throw new Error('Canvas2DRenderer: no se pudo obtener el contexto 2D')
    }
    this.ctx = ctx
    this.camera = camera
    this.sprites = sprites ?? null
    this.terrain = new TerrainRenderer(camera, tiles, sprites)
    this.objects = entities && sprites ? new ObjectRenderer(entities) : null
  }

  resize(viewport: ViewportInfo): void {
    this.ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
    this.terrain.setViewport(viewport)
  }

  get terrainStats(): { drawn: number; considered: number; total: number } {
    return this.terrain.stats
  }

  get objectStats(): { count: number; drawnLastFrame: number; drawOrder: number[] } {
    return {
      count: this.objects?.count ?? 0,
      drawnLastFrame: this.objects?.lastDrawOrder.length ?? 0,
      drawOrder: this.objects?.lastDrawOrder ?? [],
    }
  }

  render(_frameTimeMs: number, _elapsed: number): void {
    const { ctx } = this
    ctx.save()
    // Clear en píxeles físicos para no depender del frame anterior.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = RENDER_CONFIG.backgroundColor
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.restore()

    this.terrain.draw(ctx)

    // Entidades con depth sorting encima del terreno.
    if (this.objects && this.sprites) {
      this.objects.draw(ctx, this.camera, this.sprites)
    }
  }

  dispose(): void {
    // Canvas 2D no requiere liberar recursos explícitos hoy.
  }
}
