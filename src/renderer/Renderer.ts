import type { ViewportInfo } from '../game/types'

/**
 * Interfaz que desacopla el juego del backend de render.
 * Hoy existe Canvas2DRenderer; mañana podría haber otro sin tocar la lógica.
 */
export interface Renderer {
  resize(viewport: ViewportInfo): void
  render(frameTimeMs: number, elapsed: number): void
  dispose(): void
}
