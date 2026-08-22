import type { Camera2D } from '../../game/systems/Camera2D'
import type { FarmEntity } from '../../game/entities/farmEntities'
import type { SpriteAssetManager } from '../../game/assets/SpriteAssetManager'

/**
 * Dibuja las entidades con sprite (granero, árboles, estanque, corral,
 * huertos) ordenadas por profundidad depth = worldY de su base.
 * 1 imagen cacheada → N drawImage: nunca copias del PNG.
 */
export class ObjectRenderer {
  /** Entidades ya ordenadas por depth (se reordenan solo si cambia el mundo). */
  private entities: FarmEntity[]
  /** Orden de dibujo del último frame (worldY) — para tests/debug. */
  lastDrawOrder: number[] = []

  constructor(entities: FarmEntity[]) {
    this.entities = [...entities].sort((a, b) => a.depth - b.depth)
  }

  get count(): number {
    return this.entities.length
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera2D, sprites: SpriteAssetManager): void {
    const z = camera.zoom
    const order: number[] = []

    for (const e of this.entities) {
      const img = sprites.get(e.key)
      if (!img || !img.naturalWidth) continue // fallback progresivo: nada aún

      const s = camera.worldToScreen(e.x, e.y)
      const dw = img.naturalWidth * e.scale * z
      const dh = img.naturalHeight * e.scale * z

      // Culling barato por AABB del sprite.
      const dx = s.x - e.anchorX * dw
      const dy = s.y - e.anchorY * dh
      if (dx > ctx.canvas.clientWidth || dy > ctx.canvas.clientHeight) continue
      if (dx + dw < 0 || dy + dh < 0) continue

      ctx.drawImage(img, dx, dy, dw, dh)
      order.push(e.depth)
    }

    this.lastDrawOrder = order
  }
}
