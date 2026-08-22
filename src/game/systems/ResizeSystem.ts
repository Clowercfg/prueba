import { RENDER_CONFIG } from '../config/renderConfig'
import type { ViewportInfo } from '../types'

type ResizeCallback = (viewport: ViewportInfo) => void

/**
 * Mantiene el canvas ajustado al viewport real (CSS pixels) y multiplica el
 * backing store por el devicePixelRatio, limitado a maxDevicePixelRatio.
 *
 * - ResizeObserver sobre el contenedor: cubre rotación, teclado, splits.
 * - visualViewport si existe: cubre zoom de página en Mini Apps.
 */
export class ResizeSystem {
  private readonly canvas: HTMLCanvasElement
  private readonly container: HTMLElement
  private readonly onResize?: ResizeCallback

  private observer: ResizeObserver | null = null
  private lastViewport: ViewportInfo | null = null

  constructor(canvas: HTMLCanvasElement, onResize?: ResizeCallback) {
    this.canvas = canvas
    this.container = canvas.parentElement ?? document.body
    this.onResize = onResize
  }

  attach(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.apply())
      this.observer.observe(this.container)
    }
    window.addEventListener('resize', this.handleWindowChange)
    window.addEventListener('orientationchange', this.handleWindowChange)
    window.visualViewport?.addEventListener('resize', this.handleWindowChange)

    this.apply()
  }

  detach(): void {
    this.observer?.disconnect()
    this.observer = null
    window.removeEventListener('resize', this.handleWindowChange)
    window.removeEventListener('orientationchange', this.handleWindowChange)
    window.visualViewport?.removeEventListener('resize', this.handleWindowChange)
  }

  /** DPR efectivo (limitado). Útil para verificación. */
  getEffectiveDpr(): number {
    return clampDpr(window.devicePixelRatio)
  }

  private handleWindowChange = (): void => {
    this.apply()
  }

  apply(): void {
    const cssWidth = Math.max(1, Math.floor(this.container.clientWidth))
    const cssHeight = Math.max(1, Math.floor(this.container.clientHeight))
    const dpr = clampDpr(window.devicePixelRatio)

    const next: ViewportInfo = { width: cssWidth, height: cssHeight, dpr }
    const prev = this.lastViewport
    if (
      prev &&
      prev.width === next.width &&
      prev.height === next.height &&
      prev.dpr === next.dpr
    ) {
      return
    }

    // Backing store en píxeles físicos; estilo en CSS pixels.
    this.canvas.width = Math.round(cssWidth * dpr)
    this.canvas.height = Math.round(cssHeight * dpr)
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`

    this.lastViewport = next
    this.onResize?.(next)
  }
}

export function clampDpr(devicePixelRatio: number): number {
  const raw =
    typeof devicePixelRatio === 'number' && Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1
  return Math.min(raw, RENDER_CONFIG.maxDevicePixelRatio)
}
