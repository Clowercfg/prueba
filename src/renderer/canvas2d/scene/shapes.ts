/**
 * Primitivas de dibujo isométrico compartidas por todos los pintores.
 * Todo se dibuja en píxeles CSS de pantalla; las alturas se dan en px
 * a zoom 1 y se multiplican por camera.zoom para mantener proporciones.
 */
import type { Camera2D } from '../../../game/systems/Camera2D'

export interface Vec2S {
  x: number
  y: number
}

/** Contexto de pintura: envuelve la cámara y el ctx destino. */
export interface PaintCtx {
  g: CanvasRenderingContext2D
  /** Zoom actual de cámara. */
  readonly z: number
  /** Mundo → pantalla (base del objeto, elevación 0). */
  at(wx: number, wy: number): Vec2S
}

export function createPaintCtx(g: CanvasRenderingContext2D, cam: Camera2D): PaintCtx {
  return {
    g,
    z: cam.zoom,
    at: (wx: number, wy: number) => cam.worldToScreen(wx, wy),
  }
}

/** Proyecta un punto del mundo elevado elevPx (px @zoom1) sobre pantalla. */
export function pt(c: PaintCtx, wx: number, wy: number, elevPx = 0): Vec2S {
  const s = c.at(wx, wy)
  return { x: s.x, y: s.y - elevPx * c.z }
}

/** Sombra suave elíptica (luz global desde arriba-izquierda). */
export function shadowEllipse(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  alpha: number,
): void {
  if (rx <= 0.5 || ry <= 0.5) return
  g.save()
  g.translate(cx, cy)
  g.scale(1, ry / rx)
  const grad = g.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx)
  grad.addColorStop(0, `rgba(36,62,48,${alpha})`)
  grad.addColorStop(0.7, `rgba(36,62,48,${alpha * 0.55})`)
  grad.addColorStop(1, 'rgba(36,62,48,0)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(0, 0, rx, 0, Math.PI * 2)
  g.fill()
  g.restore()
}

/**
 * Sombra estándar de objeto apoyado en (wx, wy): elipse desplazada hacia
 * abajo-derecha (dirección global de luz coherente en todo el mapa).
 * rWu ≈ radio del objeto en unidades de mundo.
 */
export function objectShadow(
  c: PaintCtx,
  wx: number,
  wy: number,
  rWu: number,
  alpha = 0.22,
): void {
  const L = Math.SQRT2
  const base = c.at(wx, wy)
  const offX = 0.18 * rWu * c.z
  const offY = 0.09 * rWu * c.z
  shadowEllipse(
    c.g,
    base.x + offX,
    base.y + offY,
    rWu * L * 32 * c.z * 0.92,
    rWu * L * 16 * c.z * 0.92,
    alpha,
  )
}

/** Polígono relleno a partir de puntos ya proyectados. */
export function fillPoly(g: CanvasRenderingContext2D, pts: Vec2S[], color: string): void {
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x, pts[k].y)
  g.closePath()
  g.fillStyle = color
  g.fill()
}

/** Línea con extremos redondeados entre puntos proyectados. */
export function strokePoly(
  g: CanvasRenderingContext2D,
  pts: Vec2S[],
  color: string,
  widthPx: number,
): void {
  if (pts.length < 2) return
  g.beginPath()
  g.moveTo(pts[0].x, pts[0].y)
  for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x, pts[k].y)
  g.strokeStyle = color
  g.lineWidth = widthPx
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.stroke()
}

/**
 * Semiejes en pantalla de una elipse del plano del mundo con radios
 * (rx_wu, ry_wu). Una elipse alineada a los ejes de mundo se proyecta como
 * elipse axis-aligned de semiejes hypot(rx*32, ry*32) e hypot(rx*16, ry*16).
 */
export function groundEllipseAxes(rxWu: number, ryWu: number, zoom: number): {
  sx: number
  sy: number
} {
  return {
    sx: Math.hypot(rxWu * 32, ryWu * 32) * zoom,
    sy: Math.hypot(rxWu * 16, ryWu * 16) * zoom,
  }
}
