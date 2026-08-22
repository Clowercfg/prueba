export const GAME_CONFIG = {
  name: 'Harvest Valley',
  version: '0.1.0',
} as const

/** Delta máximo en ms antes de recortar (evita espiral tras tab en background). */
export const MAX_FRAME_DELTA_MS = 100

/**
 * Mapa portrait 9:16: grid 30x30 del que solo la banda diagonal activa
 * (|i-j| <= 7, i+j en [10..50], ver layoutConfig) contiene granja.
 * La cámara fija encuadra SOLO la banda: composición vertical real.
 */
export const MAP_CONFIG = {
  tilesX: 30,
  tilesY: 30,
} as const
