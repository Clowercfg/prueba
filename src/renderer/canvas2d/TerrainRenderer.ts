import { TerrainType, type TileData } from '../../game/types'
import { TILE_HALF_H, TILE_HALF_W, tileToWorldCenter } from '../../game/systems/isometricProjection'
import type { Camera2D } from '../../game/systems/Camera2D'
import type { TileSystem } from '../../game/systems/TileSystem'
import { ASSETS_CONFIG } from '../../game/config/assetsConfig'
import type { SpriteAssetManager } from '../../game/assets/SpriteAssetManager'

/**
 * Paleta de desarrollo por variante. NO es el arte final: cuando existan
 * sprites se sustituirá el fill por drawImage con la misma lógica de culling.
 */
const DEV_COLORS: Readonly<Record<TerrainType, readonly string[]>> = {
  [TerrainType.GRASS]: ['#7ab654', '#72ac4d', '#82bf5f', '#70a54a'],
  [TerrainType.DIRT]: ['#9b7653', '#93704e', '#a37d59'],
  [TerrainType.PATH]: ['#c9b28a', '#c2aa80', '#d0ba92'],
  [TerrainType.SAND]: ['#e8d8a0', '#e2d096', '#eedfa9'],
  [TerrainType.WATER]: ['#3f7fb5', '#4587bd'],
  [TerrainType.FARM_SOIL]: ['#6b4a32', '#64452e', '#725037'],
  [TerrainType.ROCK]: ['#8d8d93', '#84848a'],
  [TerrainType.FOREST]: ['#3e7a3a', '#387234', '#448240', '#356b31'],
  [TerrainType.VOID]: ['#000000'],
}

const TILE_STROKE = 'rgba(20, 32, 16, 0.05)'
const DETAIL_COLOR = 'rgba(0, 0, 0, 0.10)'

/**
 * Dibuja el terreno visible con viewport culling:
 * 1) calcula el AABB de tiles que toca el rect visible (margen para rombos),
 * 2) recorre ese rango y descarta tiles cuyo rombo quede fuera del viewport.
 */
export class TerrainRenderer {
  private readonly camera: Camera2D
  private readonly tiles: TileSystem
  private readonly sprites: SpriteAssetManager | null

  private viewW = 1
  private viewH = 1
  private drawnLastFrame = 0
  private consideredLastFrame = 0

  constructor(camera: Camera2D, tiles: TileSystem, sprites?: SpriteAssetManager | null) {
    this.camera = camera
    this.tiles = tiles
    this.sprites = sprites ?? null
  }

  get stats(): { drawn: number; considered: number; total: number } {
    return {
      drawn: this.drawnLastFrame,
      considered: this.consideredLastFrame,
      total: this.tiles.tileCount,
    }
  }

  setViewport(size: { width: number; height: number }): void {
    this.viewW = Math.max(1, size.width)
    this.viewH = Math.max(1, size.height)
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const z = this.camera.zoom
    const hw = TILE_HALF_W * z
    const hh = TILE_HALF_H * z

    // Rango candidato: AABB del rect visible en mundo (+margen de rombos vecinos).
    const tl = this.camera.screenToWorld(0, 0)
    const tr = this.camera.screenToWorld(this.viewW, 0)
    const bl = this.camera.screenToWorld(0, this.viewH)
    const br = this.camera.screenToWorld(this.viewW, this.viewH)

    const minX = Math.min(tl.x, tr.x, bl.x, br.x)
    const maxX = Math.max(tl.x, tr.x, bl.x, br.x)
    const minY = Math.min(tl.y, tr.y, bl.y, br.y)
    const maxY = Math.max(tl.y, tr.y, bl.y, br.y)

    const i0 = Math.max(0, Math.floor(minX) - 1)
    const i1 = Math.min(this.tiles.width - 1, Math.ceil(maxX) + 1)
    const j0 = Math.max(0, Math.floor(minY) - 1)
    const j1 = Math.min(this.tiles.height - 1, Math.ceil(maxY) + 1)

    let drawn = 0
    let considered = 0

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const tile = this.tiles.getTile(i, j)
        if (!tile) continue
        if (tile.type === TerrainType.VOID) continue // fuera de la granja
        considered++

        const world = tileToWorldCenter(i, j)
        const s = this.camera.worldToScreen(world.x, world.y)

        // Culling: si el rombo completo está fuera del viewport, no dibujar.
        if (s.x + hw < 0 || s.x - hw > this.viewW || s.y + hh < 0 || s.y - hh > this.viewH) {
          continue
        }

        this.drawTile(ctx, s.x, s.y, hw, hh, tile, z)
        drawn++
      }
    }

    this.drawnLastFrame = drawn
    this.consideredLastFrame = considered
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    hw: number,
    hh: number,
    tile: TileData,
    zoom: number,
  ): void {
    // Rombo base (fallback visual y contorno de rejilla).
    ctx.beginPath()
    ctx.moveTo(sx, sy - hh)
    ctx.lineTo(sx + hw, sy)
    ctx.lineTo(sx, sy + hh)
    ctx.lineTo(sx - hw, sy)
    ctx.closePath()

    // Sprite cargado → se mapea el cuadrado 64×64 al rombo con una
    // transformación afín (N→E eje X, N→W eje Y). Si aún no llegó o falló,
    // se dibuja el color plano dev como fallback temporal.
    const sprite = this.sprites?.get(spriteKey(tile))
    if (sprite) {
      const inv = 1 / ASSETS_CONFIG.spriteSize
      ctx.save()
      ctx.transform(hw * inv, hh * inv, -hw * inv, hh * inv, sx, sy - hh)
      ctx.drawImage(sprite, 0, 0)
      ctx.restore()
      ctx.strokeStyle = TILE_STROKE
      ctx.lineWidth = 1
      ctx.stroke()
      return
    }

    const palette = DEV_COLORS[tile.type]
    ctx.fillStyle = palette[tile.variant % palette.length]
    ctx.fill()
    ctx.strokeStyle = TILE_STROKE
    ctx.lineWidth = 1
    ctx.stroke()

    // Detalle determinista por variante (solo con mucho zoom; en portrait el
    // auto-fit queda lejos de este umbral y la rejilla no se percibe).
    if (zoom >= 1.4) {
      const h = ((tile.i * 668265261) ^ (tile.j * 374761393)) >>> 0
      const dx = ((h % 21) / 20 - 0.5) * hw
      const dy = ((((h >>> 5) % 17) / 16) - 0.5) * hh
      ctx.fillStyle = DETAIL_COLOR
      ctx.fillRect(sx + dx - 1.5 * zoom, sy + dy - 1 * zoom, 3 * zoom, 2 * zoom)
    }
  }
}

/** Clave lógica del sprite de un tile, p.ej. 'terrain/grass_01.png'. */
function spriteKey(tile: TileData): string {
  const name = TerrainType[tile.type].toLowerCase()
  return `terrain/${name}_0${tile.variant + 1}.png`
}
