import type { Camera2D } from './Camera2D'
import { RENDER_CONFIG } from '../config/renderConfig'
import type { Vec2 } from './isometricProjection'

/**
 * Interaction: clasifica la entrada del canvas en TAP / DRAG / PINCH / RUEDA
 * y la traduce a órdenes de cámara + callbacks de juego.
 *
 *   - drag  → camera.panByPixels (la cámara clampea a los límites)
 *   - pinch → camera.pinch (anclado al punto medio, zoom suavizado)
 *   - rueda → camera.zoomAt (desktop)
 *   - tap   → onTap(world) con el punto de mundo bajo el dedo
 *
 * No toca stores ni render: es puramente entrada. Los gestos empiezan a
 * funcionar desde el primer frame (los listeners se registran en attach()).
 */

const TAP_SLOP_PX = 9
const TAP_MAX_MS = 450

export interface InteractionHandlers {
  /** Tap confirmado: recibe coordenadas de MUNDO bajo el punto tocado. */
  onTap: (world: Vec2, screen: { x: number; y: number }) => void
  /** Primer gesto real de pan/pinch/rueda (para soltar el encuadre fijo). */
  onUserInteract?: () => void
}

/**
 * #25: con cámara completamente fija se instancian los gestos de movimiento
 * DESACTIVADOS; el tap de selección siempre queda activo. Los movimientos
 * igualmente cancelan un tap en curso (no hay selección por arrastre).
 */
export interface InteractionOptions {
  /** Arrastre → camera.panByPixels. */
  pan?: boolean
  /** Pinch de dos dedos → camera.pinch. */
  pinch?: boolean
  /** Rueda del ratón → camera.zoomAt. */
  wheel?: boolean
}

interface Ptr {
  x: number
  y: number
}

function distAndMid(a: Ptr, b: Ptr): { d: number; mx: number; my: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return { d: Math.hypot(dx, dy), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
}

export class Interaction {
  private readonly pointers = new Map<number, Ptr>()
  private downAt = 0
  private tapX = 0
  private tapY = 0
  private dragging = false
  private pinching = false
  private prevPinch: { d: number; mx: number; my: number } | null = null
  private interacted = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera2D,
    private readonly handlers: InteractionHandlers,
    private readonly opts: InteractionOptions = {},
  ) {}

  private get panEnabled(): boolean {
    return this.opts.pan ?? true
  }
  private get pinchEnabled(): boolean {
    return this.opts.pinch ?? true
  }
  private get wheelEnabled(): boolean {
    return this.opts.wheel ?? true
  }

  attach(): void {
    const c = this.canvas
    c.addEventListener('pointerdown', this.onDown)
    c.addEventListener('pointermove', this.onMove)
    c.addEventListener('pointerup', this.onUp)
    c.addEventListener('pointercancel', this.onUp)
    c.addEventListener('wheel', this.onWheel, { passive: false })
  }

  detach(): void {
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onDown)
    c.removeEventListener('pointermove', this.onMove)
    c.removeEventListener('pointerup', this.onUp)
    c.removeEventListener('pointercancel', this.onUp)
    c.removeEventListener('wheel', this.onWheel)
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private markInteracted(): void {
    if (!this.interacted) {
      this.interacted = true
      this.handlers.onUserInteract?.()
    }
  }

  private onDown = (e: PointerEvent): void => {
    // Captura: los move/up siguen llegando aunque el dedo salga del canvas.
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      /* algunos navegadores antiguos: sin captura también funciona */
    }
    const p = this.local(e)
    this.pointers.set(e.pointerId, p)

    if (this.pointers.size === 1) {
      this.downAt = performance.now()
      this.tapX = p.x
      this.tapY = p.y
      this.dragging = false
      this.pinching = false
      this.prevPinch = null
    } else if (this.pointers.size === 2) {
      // Segundo dedo: se cancela tap/drag y empieza pinch.
      this.dragging = false
      this.tapX = NaN
      this.beginPinch()
    }
  }

  private onMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    const p = this.local(e)

    if (this.pointers.size >= 2 && this.pinching) {
      prev.x = p.x
      prev.y = p.y
      const [a, b] = [...this.pointers.values()]
      const cur = distAndMid(a, b)
      if (this.prevPinch && this.pinchEnabled) {
        this.camera.pinch(this.prevPinch.d, cur.d, cur.mx, cur.my)
        this.markInteracted()
      }
      this.prevPinch = cur
      return
    }

    if (this.pointers.size === 1) {
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      prev.x = p.x
      prev.y = p.y
      if (!this.dragging) {
        if (Math.hypot(p.x - this.tapX, p.y - this.tapY) > TAP_SLOP_PX) {
          this.dragging = true
          this.markInteracted()
        }
      }
      if (this.dragging) {
        this.markInteracted()
        if (this.panEnabled) this.camera.panByPixels(dx, dy)
      }
    }
  }

  private onUp = (e: PointerEvent): void => {
    if (!this.pointers.delete(e.pointerId)) return

    if (this.pinching) {
      if (this.pointers.size === 1) {
        // Queda un dedo tras el pinch: reinicia la base de arrastre SIN tap.
        this.pinching = false
        this.prevPinch = null
        this.dragging = true
        this.tapX = NaN
      }
      return
    }

    if (this.pointers.size === 0 && !this.dragging && !Number.isNaN(this.tapX)) {
      const dt = performance.now() - this.downAt
      if (dt <= TAP_MAX_MS) {
        const w = this.camera.screenToWorld(this.tapX, this.tapY)
        this.handlers.onTap(w, { x: this.tapX, y: this.tapY })
      }
    }
  }

  private beginPinch(): void {
    const [a, b] = [...this.pointers.values()]
    const cur = distAndMid(a, b)
    this.pinching = true
    this.prevPinch = cur
  }

  private onWheel = (e: WheelEvent): void => {
    // Siempre se frena la página; el zoom sólo si está habilitado (#25).
    e.preventDefault()
    if (!this.wheelEnabled) return
    const p = this.local(e)
    const factor = e.deltaY < 0 ? RENDER_CONFIG.wheelZoomStep : 1 / RENDER_CONFIG.wheelZoomStep
    this.camera.zoomAt(p.x, p.y, factor)
    this.markInteracted()
  }
}
