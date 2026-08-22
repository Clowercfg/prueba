import { MAP_CONFIG } from '../config/gameConfig'
import { BAND_CONFIG, isBandActive, PADS } from '../config/layoutConfig'
import { TerrainType, type TileData } from '../types'
import { hashVariant } from './tileHash'

/** Número de variantes por tipo de terreno (grass_01..grass_04, etc). */
const VARIANTS_PER_TYPE: Readonly<Record<TerrainType, number>> = {
  [TerrainType.GRASS]: 4,
  [TerrainType.DIRT]: 3,
  [TerrainType.PATH]: 3,
  [TerrainType.SAND]: 3,
  [TerrainType.WATER]: 2,
  [TerrainType.FARM_SOIL]: 3,
  [TerrainType.ROCK]: 2,
  [TerrainType.FOREST]: 4,
  [TerrainType.VOID]: 1,
}

/**
 * Datos del mapa: granja portrait (banda diagonal activa) + consulta de tiles.
 *
 * - Coordenadas de mundo: 1 unidad = 1 tile; la tile (i,j) ocupa [i,i+1)x[j,j+1).
 * - Terreno y variante viven en typed arrays (cache-friendly en móvil).
 * - Variantes 100% deterministas vía hash (mismo mapa → mismas variantes).
 */
export class TileSystem {
  readonly width: number
  readonly height: number
  readonly tileCount: number

  private readonly types: Uint8Array
  private readonly variants: Uint8Array

  constructor(width: number = MAP_CONFIG.tilesX, height: number = MAP_CONFIG.tilesY) {
    this.width = width
    this.height = height
    this.tileCount = width * height
    this.types = new Uint8Array(this.tileCount)
    this.variants = new Uint8Array(this.tileCount)

    // IMPORTANTE: 0 es GRASS en el enum; el vacío hay que asignarlo explícito.
    this.types.fill(TerrainType.VOID)

    this.generate()
  }

  /** Devuelve la tile o null si está fuera de rango. */
  getTile(i: number, j: number): TileData | null {
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return null
    const idx = j * this.width + i
    const type = this.types[idx]
    return { i, j, type, variant: this.variants[idx] }
  }

  getType(i: number, j: number): TerrainType {
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return TerrainType.VOID
    return this.types[j * this.width + i]
  }

  /** Variante determinista de una coordenada para un tipo (útil al editar el mapa). */
  variantFor(i: number, j: number, type: TerrainType): number {
    return hashVariant(i, j, VARIANTS_PER_TYPE[type], type)
  }

  /** Recuento aproximado por tipo (para HUD/debug). */
  countByType(type: TerrainType): number {
    let n = 0
    for (let k = 0; k < this.types.length; k++) if (this.types[k] === type) n++
    return n
  }

  /**
   * Granja portrait 9:16 (de arriba a abajo por v=i+j):
   * bosque → GRANERO → reserva casa → 4 huertos → corral + estanque → bosque.
   * Todo dentro de la banda activa; el resto del grid queda VOID.
   */
  private generate(): void {
    // 1) Banda activa base de hierba.
    for (let j = 0; j < this.height; j++) {
      for (let i = 0; i < this.width; i++) {
        if (isBandActive(i, j)) this.set(i, j, TerrainType.GRASS)
      }
    }

    // 2) Bosque superior e inferior con claros deterministas.
    this.fillForestBand(10, 14)
    this.fillForestBand(48, 50)

    // 3) Caminos: espina central zigzag (u=0/1) + ramales.
    this.fillSpinePath()
    this.fillRect(TerrainType.PATH, 7, 8, 9, 8) // acceso granero
    this.fillRect(TerrainType.PATH, 12, 13, 16, 13) // acceso reserva casa
    this.fillRect(TerrainType.PATH, 10, 16, 19, 16) // plaza entre huertos
    this.fillRect(TerrainType.PATH, 18, 22, 21, 22) // acceso corral
    this.fillRect(TerrainType.PATH, 21, 24, 23, 24) // acceso estanque

    // 4) Pads de tierra bajo edificios/reserva/corral.
    this.fillRect(TerrainType.DIRT, PADS.barn.x0, PADS.barn.y0, PADS.barn.x1, PADS.barn.y1)
    this.fillRect(TerrainType.DIRT, PADS.house.x0, PADS.house.y0, PADS.house.x1, PADS.house.y1)
    this.fillRect(TerrainType.DIRT, PADS.pen.x0, PADS.pen.y0, PADS.pen.x1, PADS.pen.y1)

    // 5) Huertos (después de caminos: el pad gana su rect exacto).
    const plots = [PADS.plotA, PADS.plotB, PADS.plotC, PADS.plotD]
    for (const p of plots) this.fillRect(TerrainType.FARM_SOIL, p.x0, p.y0, p.x1, p.y1)

    // 6) Estanque con orilla de arena.
    this.fillPond(24, 22, 2.5, 2.1)

    // 7) Textura rocosa en los bordes de la banda (transición hacia el vacío).
    for (let j = 0; j < this.height; j++) {
      for (let i = 0; i < this.width; i++) {
        if (!isBandActive(i, j)) continue
        const u = Math.abs(i - j)
        if (
          (u === 6 || u === 7) &&
          this.getType(i, j) === TerrainType.GRASS &&
          tileHashUnit(i, j, 555) < 0.09
        ) {
          this.set(i, j, TerrainType.ROCK)
        }
      }
    }
  }

  private set(i: number, j: number, type: TerrainType): void {
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return
    const idx = j * this.width + i
    if (this.types[idx] === TerrainType.VOID && type !== TerrainType.GRASS) return
    this.types[idx] = type
    this.variants[idx] = hashVariant(i, j, VARIANTS_PER_TYPE[type], type)
  }

  private fillRect(type: TerrainType, x0: number, y0: number, x1: number, y1: number): void {
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        if (!isBandActive(i, j)) continue
        this.set(i, j, type)
      }
    }
  }

  /** Espina central: alterna u=0/u=1 según paridad de v (zigzag orgánico). */
  private fillSpinePath(): void {
    for (let v = 14; v <= 47; v++) {
      const u = v % 2 === 0 ? 0 : 1
      const i = (v + u) / 2
      const j = (v - u) / 2
      this.set(i, j, TerrainType.PATH)
    }
  }

  /** Franja de bosque en las filas v∈[v0,v1] de la banda (con claros). */
  private fillForestBand(v0: number, v1: number): void {
    for (let v = Math.max(v0, BAND_CONFIG.vMin); v <= Math.min(v1, BAND_CONFIG.vMax); v++) {
      for (let u = -BAND_CONFIG.halfU; u <= BAND_CONFIG.halfU; u++) {
        if (((v + u) & 1) !== 0) continue // celda no entera
        const i = (v + u) / 2
        const j = (v - u) / 2
        const h = tileHashUnit(i, j, 777)
        if (h > 0.86) continue // claro
        this.set(i, j, h < 0.06 ? TerrainType.ROCK : TerrainType.FOREST)
      }
    }
  }

  private fillPond(cx: number, cy: number, rx: number, ry: number): void {
    const i0 = Math.floor(cx - rx - 1.5)
    const i1 = Math.ceil(cx + rx + 1.5)
    const j0 = Math.floor(cy - ry - 1.5)
    const j1 = Math.ceil(cy + ry + 1.5)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!isBandActive(i, j)) continue
        const nd = Math.hypot((i + 0.5 - cx) / rx, (j + 0.5 - cy) / ry)
        if (nd <= 1) this.set(i, j, TerrainType.WATER)
        else if (nd <= 1.35) this.set(i, j, TerrainType.SAND)
      }
    }
  }
}

/** Hash normalizado a [0,1), determinista. Usado solo en generación (no por frame). */
function tileHashUnit(i: number, j: number, salt: number): number {
  return hashVariant(i, j, 1000, salt) / 1000
}
