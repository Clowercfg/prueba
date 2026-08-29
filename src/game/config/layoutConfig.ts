import { RENDER_CONFIG } from './renderConfig'

/**
 * Composición de la granja para móvil VERTICAL 9:16.
 *
 * La granja vive en una banda diagonal del grid: la posición horizontal en
 * pantalla depende de u = i - j y la vertical de v = i + j. Restringiendo u
 * (banda estrecha) y estirando v (recorrido largo), el contenido proyectado
 * es alto y estrecho ≈ 9:15.5, ideal para pantallas portrait.
 *
 * Zonas de arriba a abajo (v creciente):
 *   v[10..14] bosque superior · v~18 granero · v~26 reserva casa
 *   v[25..38] huertos (4 parcelas) · v[42..50] corral + estanque + bosque bajo
 */

/** Banda activa del grid. */
export const BAND_CONFIG = {
  /** Máximo |i - j| de una celda activa. */
  halfU: 7,
  /** Rango de i + j de una celda activa. */
  vMin: 10,
  vMax: 50,
} as const

export function isBandActive(i: number, j: number): boolean {
  const u = Math.abs(i - j)
  const v = i + j
  return u <= BAND_CONFIG.halfU && v >= BAND_CONFIG.vMin && v <= BAND_CONFIG.vMax
}

/**
 * Área segura: hueco arriba para Top UI / notch / Dynamic Island y abajo para
 * Bottom Navigation / barra del navegador / UI de Telegram Mini App.
 * En Telegram Desktop (tdesktop) no hay safe-area inferior.
 */
export function getSafeArea(platform?: string): { top: number; bottom: number } {
  if (platform === 'tdesktop') return { top: 56, bottom: 0 }
  return { top: 56, bottom: 86 }
}

export const SAFE_AREA = getSafeArea()

/**
 * Límites REALES del terreno jugable (#25), derivados de la banda activa:
 *   u = i-j ∈ [-(halfU+1), halfU+1] · v = i+j ∈ [vMin, vMax+2]
 * Despejando i=(u+v)/2 y j=(v-u)/2 queda el AABB en coords de mundo.
 * NO se inventan valores: cualquier cambio de BAND_CONFIG los actualiza.
 */
export const WORLD_BOUNDS = (() => {
  const uExt = BAND_CONFIG.halfU + 1 // extensión u incluyendo medio rombo
  return {
    minX: (BAND_CONFIG.vMin - uExt) / 2,
    minY: (BAND_CONFIG.vMin - uExt) / 2,
    maxX: (BAND_CONFIG.vMax + 2 + uExt) / 2,
    maxY: (BAND_CONFIG.vMax + 2 + uExt) / 2,
  }
})()

/**
 * Encuadre del TERRENO proyectado (rombo isométrico de la banda) a zoom 1:
 * ancho = 2·uExt·32 px, alto = Δv·16 px, centro en i+j medio.
 * Sirve para fit/clipping de cámara a partir de coordenadas reales.
 */
export const GROUND_VIEW = (() => {
  const hw = RENDER_CONFIG.tileWidth / 2
  const hh = RENDER_CONFIG.tileHeight / 2
  const uExt = BAND_CONFIG.halfU + 1
  const v0 = BAND_CONFIG.vMin
  const v1 = BAND_CONFIG.vMax + 2
  return {
    spanW: 2 * uExt * hw,
    spanH: (v1 - v0) * hh,
    centerIso: { x: 0, y: ((v0 + v1) / 2) * hh },
  }
})()

/**
 * Encuadre del contenido en píxeles iso a zoom 1, respecto al origen del mapa:
 * span = tamaño total a encuadrar; centerIso = centro del contenido proyectado.
 *
 * Derivado de la banda: x ∈ [±(halfU+½)·32] (centros ±7·32 más medio rombo),
 * y desde la copa del árbol más alto hasta el desborde inferior del corral.
 */
export const CONTENT_VIEW = (() => {
  const hw = RENDER_CONFIG.tileWidth / 2
  const hh = RENDER_CONFIG.tileHeight / 2
  const left = -(BAND_CONFIG.halfU + 1) * hw // -256
  const right = (BAND_CONFIG.halfU + 1) * hw // 256
  const top = (BAND_CONFIG.vMin + 1) * hh - 150 // copas de árboles (~150 px)
  const bottom = (BAND_CONFIG.vMax + 2) * hh + 60 // base corral + margen sprite
  return {
    spanW: right - left,
    spanH: bottom - top,
    centerIso: { x: (left + right) / 2, y: (top + bottom) / 2 },
  }
})()

/** Rectángulos de pads sobre el terreno (coords de tile, inclusivos). */
export const PADS = {
  barn: { x0: 7, y0: 7, x1: 11, y1: 11 },
  house: { x0: 13, y0: 11, x1: 16, y1: 14 }, // reserva futura casa
  plotA: { x0: 10, y0: 15, x1: 12, y1: 16 },
  plotB: { x0: 12, y0: 17, x1: 14, y1: 18 },
  plotC: { x0: 17, y0: 14, x1: 19, y1: 15 },
  plotD: { x0: 19, y0: 16, x1: 21, y1: 17 },
  pen: { x0: 19, y0: 23, x1: 22, y1: 25 },
} as const

/** Centro continuo de un pad en coords de mundo (1 unidad = 1 tile). */
export function padCenterWorld(pad: { x0: number; y0: number; x1: number; y1: number }): {
  x: number
  y: number
} {
  return { x: (pad.x0 + pad.x1 + 1) / 2, y: (pad.y0 + pad.y1 + 1) / 2 }
}

/**
 * Parcelas jugables en orden lógico: cropStore indexa sus plantaciones y la
 * interacción resuelve taps contra ESTA lista (world space único).
 */
export const PLOT_PADS: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }> = [
  PADS.plotA,
  PADS.plotB,
  PADS.plotC,
  PADS.plotD,
]
