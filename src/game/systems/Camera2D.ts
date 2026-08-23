import { RENDER_CONFIG } from '../config/renderConfig'
import type { Size } from '../types'
import { distanceBetween, projectWorldToIso, unprojectIsoToWorld } from './isometricProjection'
import type { Vec2 } from './isometricProjection'

export interface WorldBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Parámetros del encuadre fijo (contenido ya medido a zoom 1). */
export interface FixedViewParams {
  /** Ancho del contenido en px iso a zoom 1. */
  spanW: number
  /** Alto del contenido en px iso a zoom 1. */
  spanH: number
  /** Centro del contenido en px iso a zoom 1 (relativo al origen del mapa). */
  centerIso: Vec2
  /** Márgenes de safe area (Top UI / Bottom Nav). */
  insets: { top: number; bottom: number }
}

const ZOOM_SETTLE_EPSILON = 0.0015

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/**
 * Cámara 2D sobre el mundo isométrico. No conoce DOM ni eventos: la entrada
 * llega desde CameraInputController y el tamaño desde setViewport().
 * El zoom se interpola exponencialmente hacia targetZoom (suave), manteniendo
 * fijo el punto ancla de pantalla mientras dura la animación.
 */
export class Camera2D {
  private x: number
  private y: number
  private _zoom: number
  private targetZoomValue: number
  private vpW = 1
  private vpH = 1
  private readonly bounds: WorldBounds
  private anchor: { sx: number; sy: number; wx: number; wy: number } | null = null
  /** Modo granja completa fija: sin pan, sin zoom manual, sin pinch. */
  private fixed = false

  constructor(bounds: WorldBounds) {
    this.bounds = bounds
    this.x = (bounds.minX + bounds.maxX) / 2
    this.y = (bounds.minY + bounds.maxY) / 2
    this._zoom = RENDER_CONFIG.defaultZoom
    this.targetZoomValue = this._zoom
  }

  get zoom(): number {
    return this._zoom
  }

  get targetZoom(): number {
    return this.targetZoomValue
  }

  get isFixed(): boolean {
    return this.fixed
  }

  /**
   * Abandona el modo fijo CONSERVANDO el encuadre actual (posición y zoom).
   * A partir de aquí pan/pinch/rueda responden; los límites siguen aplicando.
   */
  releaseFixed(): void {
    this.fixed = false
  }

  /**
   * CÁMARA FIJA (portrait): calcula el zoom para que TODO el contenido quepa
   * en el rect útil del viewport (descontando safe areas) y lo centra ahí.
   * Se recalcula en cada resize; el usuario no puede alterar el resultado.
   */
  setFixedView(params: FixedViewParams): void {
    this.fixed = true
    this.anchor = null

    const usableW = Math.max(1, this.vpW)
    const usableH = Math.max(1, this.vpH - params.insets.top - params.insets.bottom)

    // Zoom: cabe por ancho o por alto (el más restrictivo manda).
    const zoom = Math.min(usableW / params.spanW, usableH / params.spanH)

    // Centro del rect útil en pantalla (compensa safe areas asimétricas).
    const cyPx = params.insets.top + usableH / 2

    // cam = centroDelMundo - unproject((pantallaDeseada - centroViewport) / zoom)
    const wCenter = unprojectIsoToWorld(params.centerIso.x, params.centerIso.y)
    const off = unprojectIsoToWorld(0, (cyPx - this.vpH / 2) / zoom)

    this._zoom = zoom
    this.targetZoomValue = zoom
    this.x = wCenter.x - off.x
    this.y = wCenter.y - off.y
  }

  get position(): Vec2 {
    return { x: this.x, y: this.y }
  }

  /** Debe llamarse en cada resize; re-clampa para no perder el mapa. */
  setViewport(size: Size): void {
    this.vpW = Math.max(1, size.width)
    this.vpH = Math.max(1, size.height)
    this.clampCamera()
  }

  /** Coordenadas de mundo → píxeles CSS de pantalla. */
  worldToScreen(wx: number, wy: number): Vec2 {
    const rel = projectWorldToIso(wx - this.x, wy - this.y)
    return { x: this.vpW / 2 + rel.x * this._zoom, y: this.vpH / 2 + rel.y * this._zoom }
  }

  /** Píxeles CSS de pantalla → coordenadas de mundo. */
  screenToWorld(sx: number, sy: number): Vec2 {
    const u = unprojectIsoToWorld((sx - this.vpW / 2) / this._zoom, (sy - this.vpH / 2) / this._zoom)
    return { x: u.x + this.x, y: u.y + this.y }
  }

  distanceBetween(ax: number, ay: number, bx: number, by: number): number {
    return distanceBetween(ax, ay, bx, by)
  }

  /** Pan: delta de arrastre en píxeles de pantalla. NO-OP en modo fijo. */
  panByPixels(dxPx: number, dyPx: number): void {
    if (this.fixed) return
    if (dxPx === 0 && dyPx === 0) return
    const d = unprojectIsoToWorld(dxPx / this._zoom, dyPx / this._zoom)
    this.x -= d.x
    this.y -= d.y
    this.clampCamera()
  }

  /** Fija el punto de pantalla que permanecerá estable durante el zoom. */
  beginZoomAnchor(sx: number, sy: number): void {
    if (this.fixed) return
    const w = this.screenToWorld(sx, sy)
    this.anchor = { sx, sy, wx: w.x, wy: w.y }
  }

  setTargetZoom(zoom: number): void {
    if (this.fixed) return
    this.targetZoomValue = clamp(zoom, RENDER_CONFIG.minZoom, RENDER_CONFIG.maxZoom)
  }

  /** Zoom con rueda: factor relativo anclado al cursor. NO-OP en modo fijo. */
  zoomAt(sx: number, sy: number, factor: number): void {
    if (this.fixed) return
    this.beginZoomAnchor(sx, sy)
    this.setTargetZoom(this.targetZoomValue * factor)
  }

  /**
   * Pinch: nueva distancia/punto medio entre dedos respecto al frame anterior.
   * El punto medio también panea la cámara. NO-OP en modo fijo.
   */
  pinch(prevDist: number, nowDist: number, midX: number, midY: number): void {
    if (this.fixed) return
    if (prevDist <= 0 || nowDist <= 0) return
    this.beginZoomAnchor(midX, midY)
    this.setTargetZoom(this.targetZoomValue * (nowDist / prevDist))
  }

  /** Suavizado de zoom + corrección de ancla + límites. Llamar 1 vez por frame.
   * En modo fijo no hace nada: la vista ya es exacta y no cambia entre frames. */
  update(dt: number): void {
    if (this.fixed) return
    const t = this.targetZoomValue
    if (Math.abs(t - this._zoom) > ZOOM_SETTLE_EPSILON) {
      const k = 1 - Math.exp(-RENDER_CONFIG.zoomSmoothRate * dt)
      this._zoom += (t - this._zoom) * k
      if (Math.abs(t - this._zoom) <= ZOOM_SETTLE_EPSILON) this._zoom = t
    } else {
      this._zoom = t
    }

    if (this.anchor) {
      // Mantiene el punto de mundo bajo el punto de pantalla anclado.
      const u = unprojectIsoToWorld(
        (this.anchor.sx - this.vpW / 2) / this._zoom,
        (this.anchor.sy - this.vpH / 2) / this._zoom,
      )
      this.x = this.anchor.wx - u.x
      this.y = this.anchor.wy - u.y
      if (this._zoom === t) {
        this.clampCamera() // clamp puede mover la cámara: aplica antes de soltar el ancla
        this.anchor = null
      }
    } else {
      this.clampCamera()
    }
  }

  /**
   * Limita la cámara para que el AABB visible quede dentro de los límites.
   * Si a ese zoom se ve más mapa del que existe, centra el eje.
   */
  clampCamera(): void {
    const c0 = this.screenToWorld(0, 0)
    const c1 = this.screenToWorld(this.vpW, 0)
    const c2 = this.screenToWorld(0, this.vpH)
    const c3 = this.screenToWorld(this.vpW, this.vpH)

    let visMinX = Math.min(c0.x, c1.x, c2.x, c3.x)
    let visMaxX = Math.max(c0.x, c1.x, c2.x, c3.x)
    let visMinY = Math.min(c0.y, c1.y, c2.y, c3.y)
    let visMaxY = Math.max(c0.y, c1.y, c2.y, c3.y)

    const b = this.bounds
    let dx = 0
    let dy = 0

    if (visMaxX - visMinX >= b.maxX - b.minX) {
      dx = (b.minX + b.maxX) / 2 - (visMinX + visMaxX) / 2
    } else if (visMinX < b.minX) {
      dx = b.minX - visMinX
    } else if (visMaxX > b.maxX) {
      dx = b.maxX - visMaxX
    }

    if (visMaxY - visMinY >= b.maxY - b.minY) {
      dy = (b.minY + b.maxY) / 2 - (visMinY + visMaxY) / 2
    } else if (visMinY < b.minY) {
      dy = b.minY - visMinY
    } else if (visMaxY > b.maxY) {
      dy = b.maxY - visMaxY
    }

    if (dx !== 0 || dy !== 0) {
      this.x += dx
      this.y += dy
      visMinX += dx
      visMaxX += dx
      visMinY += dy
      visMaxY += dy
    }
  }

  centerOn(wx: number, wy: number): void {
    if (this.fixed) return
    this.x = wx
    this.y = wy
    this.clampCamera()
  }

  /** Centra la cámara en el centro de los límites del mapa. */
  centerOnMap(): void {
    if (this.fixed) return
    this.centerOn((this.bounds.minX + this.bounds.maxX) / 2, (this.bounds.minY + this.bounds.maxY) / 2)
  }

  reset(): void {
    this.setTargetZoom(RENDER_CONFIG.defaultZoom)
    this.centerOnMap()
  }
}
