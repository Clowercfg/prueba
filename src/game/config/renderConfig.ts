/**
 * Configuración del renderer Canvas 2D y de la vista isométrica.
 * El DPR se limita para no pagar el coste de pantallas de alta densidad.
 */
export const RENDER_CONFIG = {
  maxDevicePixelRatio: 2,

  /** Color fuera de los límites del mapa. */
  backgroundColor: '#1c2a20',

  /** Tamaño del rombo isométrico en px de mundo a zoom 1 (relación 2:1). */
  tileWidth: 64,
  tileHeight: 32,

  /** Límites razonables de zoom (0.4 = mapa completo en móvil, 2.5 = cerca). */
  minZoom: 0.4,
  maxZoom: 2.5,
  defaultZoom: 1,

  /** Suavizado exponencial del zoom: k = 1 - e^(-rate*dt). Mayor = más rápido. */
  zoomSmoothRate: 14,

  /** Multiplicador por muesca de rueda del ratón (desktop). */
  wheelZoomStep: 1.15,
} as const
