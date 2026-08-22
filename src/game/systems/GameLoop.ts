import { MAX_FRAME_DELTA_MS } from '../config/gameConfig'
import type { FrameInfo, RenderFn, UpdateFn } from '../types'

/**
 * Game loop basado en requestAnimationFrame.
 * Solo orquesta: no conoce canvas ni React. Llama a update (lógica) y
 * render (presentación) una vez por frame.
 */
export class GameLoop {
  private readonly update: UpdateFn
  private readonly render: RenderFn

  private rafId = 0
  private running = false
  private startTimeMs = 0
  private lastTimeMs = 0

  constructor(update: UpdateFn, render: RenderFn) {
    this.update = update
    this.render = render
  }

  get isRunning(): boolean {
    return this.running
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.startTimeMs = performance.now()
    this.lastTimeMs = this.startTimeMs
    this.rafId = requestAnimationFrame(this.tick)
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  private tick = (nowMs: number): void => {
    if (!this.running) return

    const rawDeltaMs = nowMs - this.lastTimeMs
    this.lastTimeMs = nowMs

    const deltaMs = Math.min(rawDeltaMs, MAX_FRAME_DELTA_MS)
    const frame: FrameInfo = {
      elapsed: (nowMs - this.startTimeMs) / 1000,
      delta: deltaMs / 1000,
    }

    // 1) lógica de juego; 2) presentación. Orden fijo y separado.
    this.update(frame)
    this.render(frame)

    this.rafId = requestAnimationFrame(this.tick)
  }
}
