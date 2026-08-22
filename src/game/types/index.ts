export interface Size {
  readonly width: number
  readonly height: number
}

export interface ViewportInfo extends Size {
  /** Pixel ratio efectivo usado por el canvas (limitado a MAX_DEVICE_PIXEL_RATIO). */
  readonly dpr: number
}

export interface FrameInfo {
  /** Segundos desde que arrancó el loop. */
  readonly elapsed: number
  /** Delta en segundos, limitado para evitar saltos al volver de background. */
  readonly delta: number
}

export type UpdateFn = (frame: Pick<FrameInfo, 'delta' | 'elapsed'>) => void

export type RenderFn = (frame: FrameInfo) => void

/** Tipos de terreno del mapa. El id numérico viaja en los arrays del TileSystem. */
export enum TerrainType {
  GRASS = 0,
  DIRT = 1,
  PATH = 2,
  SAND = 3,
  WATER = 4,
  FARM_SOIL = 5,
  ROCK = 6,
  FOREST = 7,
  /** Fuera de la granja: no se dibuja ni participa en el auto-fit. */
  VOID = 8,
}

export const TERRAIN_TYPE_COUNT = 9

/** Vista inmutable de una tile para consumers fuera del sistema. */
export interface TileData {
  readonly i: number
  readonly j: number
  readonly type: TerrainType
  /** Variante determinista del tipo (0..N-1): grass_01 → variant 0, etc. */
  readonly variant: number
}
