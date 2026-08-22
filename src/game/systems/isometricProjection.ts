import { RENDER_CONFIG } from '../config/renderConfig'

export interface Vec2 {
  x: number
  y: number
}

export const TILE_HALF_W = RENDER_CONFIG.tileWidth / 2
export const TILE_HALF_H = RENDER_CONFIG.tileHeight / 2

/**
 * Convierte coordenadas de mundo (1 unidad = 1 tile) a píxeles isométricos
 * a zoom 1, relativos al origen del mapa. Rombo clásico 2:1:
 * +worldX avanza hacia abajo-derecha, +worldY hacia abajo-izquierda.
 */
export function projectWorldToIso(wx: number, wy: number): Vec2 {
  return { x: (wx - wy) * TILE_HALF_W, y: (wx + wy) * TILE_HALF_H }
}

/** Inversa exacta de projectWorldToIso. */
export function unprojectIsoToWorld(sx: number, sy: number): Vec2 {
  return {
    x: (sx / TILE_HALF_W + sy / TILE_HALF_H) / 2,
    y: (sy / TILE_HALF_H - sx / TILE_HALF_W) / 2,
  }
}

/** Distancia euclídea en coordenadas de mundo. */
export function distanceBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

/** Tile que contiene un punto del mundo. */
export function worldToTileIndex(wx: number, wy: number): { i: number; j: number } {
  return { i: Math.floor(wx), j: Math.floor(wy) }
}

/** Centro en coordenadas de mundo de la tile (i, j). */
export function tileToWorldCenter(i: number, j: number): Vec2 {
  return { x: i + 0.5, y: j + 0.5 }
}
