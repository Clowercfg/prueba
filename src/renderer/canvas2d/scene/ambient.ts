/**
 * AmbientLayer: animación viva dibujada CADA FRAME sobre el cache estático.
 * Todo es barato: pocas primitivas, sin estado persistente en canvas.
 *  - Nubes suaves que derivan y proyectan sombra sobre la granja.
 *  - Estanque: anillos de oleaje y destellos titilantes (clip a la elipse).
 *  - Mariposas deambulando sobre los huertos.
 */
import { withAlpha } from './palette'
import { unit } from './rng'
import { groundEllipseAxes, shadowEllipse, type PaintCtx } from './shapes'
import { POND, GroundLayer } from './GroundLayer'

const ISO_X_SPAN = 1000 // rango iso px @zoom1 donde viajan las nubes
const ISO_Y_SPAN = 980

/**
 * CACHE #16: sprites de sombra de nube pre-horneados y Path2D del contorno
 * del estanque por bucket de zoom. Nada de gradientes/trazados por frame.
 */
let cloudSprites: HTMLCanvasElement[] | null = null

function bakeCloudSprite(rx: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  const R = rx * 2
  cv.width = R
  cv.height = R
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  const grad = g.createRadialGradient(R / 2, R / 2, 0, R / 2, R / 2, R / 2)
  grad.addColorStop(0, 'rgba(16,42,66,1)')
  grad.addColorStop(1, 'rgba(16,42,66,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, R, R)
  return cv
}

const pondPathCache = new Map<string, { path: Path2D; ctrX: number; ctrY: number }>()

function pondClipPath(c: PaintCtx): { path: Path2D } {
  const zb = Math.round(c.z * 8) / 8
  let hit = pondPathCache.get(String(zb))
  if (!hit) {
    // Contorno relativo al CENTRO del estanque → independiente del pan/zoom.
    const outline = GroundLayer.pondOutline(c, 0.92)
    const ctr = c.at(POND.cx, POND.cy)
    const path = new Path2D()
    const n = outline.length
    if (n >= 3) {
      path.moveTo(
        (outline[n - 1].x + outline[0].x) / 2 - ctr.x,
        (outline[n - 1].y + outline[0].y) / 2 - ctr.y,
      )
      for (let k = 0; k < n; k++) {
        const p = outline[k]
        const q2 = outline[(k + 1) % n]
        path.quadraticCurveTo(
          p.x - ctr.x,
          p.y - ctr.y,
          (p.x + q2.x) / 2 - ctr.x,
          (p.y + q2.y) / 2 - ctr.y,
        )
      }
      path.closePath()
    }
    hit = { path, ctrX: 0, ctrY: 0 }
    pondPathCache.set(String(zb), hit)
  }
  return { path: hit.path }
}

export class AmbientLayer {
  draw(g: CanvasRenderingContext2D, c: PaintCtx, elapsed: number): void {
    this.clouds(g, c, elapsed)
    this.pondShimmer(g, c, elapsed)
    this.butterflies(g, c, elapsed)
  }

  /** Sombras de nubes: sprites horneados derivando en diagonal. */
  private clouds(g: CanvasRenderingContext2D, c: PaintCtx, t: number): void {
    if (!cloudSprites) {
      cloudSprites = [210, 150, 260].map((rx) => bakeCloudSprite(rx))
    }
    const z = c.z
    const p0 = c.at(0, 0)
    const defs = [
      { sp: 14, ph: 0.0, rx: 210, ry: 95, a: 0.05 },
      { sp: 9, ph: 3.1, rx: 150, ry: 70, a: 0.04 },
      { sp: 11, ph: 5.4, rx: 260, ry: 120, a: 0.045 },
    ]
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i]
      const cycle = ISO_X_SPAN + 600
      const ix = (((t * d.sp + d.ph * 220) % cycle) + cycle) % cycle - 300
      const iy = ((d.ph * 700 + Math.sin(t * 0.05 + d.ph) * 60) % ISO_Y_SPAN + ISO_Y_SPAN) % ISO_Y_SPAN
      const cx = p0.x + ix * z
      const cy = p0.y + iy * z
      const spr = cloudSprites[i]
      g.save()
      g.globalAlpha = d.a
      g.translate(cx, cy)
      g.scale(1, d.ry / d.rx)
      g.drawImage(spr, -spr.width / 2, -spr.height / 2)
      g.restore()
    }
  }

  /** Oleaje y destellos dentro del estanque (clip con Path2D cacheado). */
  private pondShimmer(g: CanvasRenderingContext2D, c: PaintCtx, t: number): void {
    const axes = groundEllipseAxes(POND.rx, POND.ry, c.z)

    g.save()
    const { path } = pondClipPath(c)
    const ctr = c.at(POND.cx, POND.cy)
    g.translate(ctr.x, ctr.y)
    g.clip(path)

    // Anillos de oleaje que se expanden y desvanecen.
    const rings = [
      { ox: -0.7, oy: -0.35, period: 4.6, phase: 0.0 },
      { ox: 0.75, oy: 0.3, period: 5.8, phase: 2.1 },
      { ox: 0.1, oy: 0.55, period: 5.2, phase: 3.9 },
    ]
    for (const r of rings) {
      const local = (t + r.phase) % r.period
      const f = local / r.period
      const alpha = Math.sin(f * Math.PI) * 0.28
      if (alpha <= 0.01) continue
      // Coordenadas RELATIVAS al centro (el ctx ya está trasladado).
      const rc = { x: (r.ox - r.oy) * 32 * c.z, y: (r.ox + r.oy) * 16 * c.z }
      const rr = (0.25 + f * 0.85) * axes.sx * 0.55
      g.strokeStyle = `rgba(235,250,255,${alpha})`
      g.lineWidth = 1.6 * c.z
      g.beginPath()
      g.ellipse(rc.x, rc.y, rr, rr * 0.46, 0, 0, Math.PI * 2)
      g.stroke()
    }

    // Destellos titilantes.
    for (let k = 0; k < 8; k++) {
      const ang = unit(k, 3, 471) * Math.PI * 2
      const rad = Math.sqrt(unit(k, 5, 472)) * 0.82
      const lx = Math.cos(ang) * POND.rx * rad
      const ly = Math.sin(ang) * POND.ry * rad
      const tw = Math.sin(t * 1.7 + unit(k, 7, 473) * 6.28)
      if (tw <= 0.25) continue
      // Relativo al centro: proyección iso del delta de mundo.
      const p = { x: (lx - ly) * 32 * c.z, y: (lx + ly) * 16 * c.z }
      const s = (0.9 + unit(k, 11, 474)) * c.z
      g.fillStyle = `rgba(240,252,255,${tw * tw * 0.85})`
      g.beginPath()
      g.ellipse(p.x, p.y, s * 1.6, s * 0.7, 0, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
  }

  /** Dos mariposas con vuelo errático suave sobre los huertos. */
  private butterflies(g: CanvasRenderingContext2D, c: PaintCtx, t: number): void {
    const defs = [
      { hx: 15.2, hy: 16.4, sp: 0.55, ph: 0, col: '#f59e2c' },
      { hx: 19.6, hy: 15.6, sp: 0.42, ph: 2.6, col: '#e86fa4' },
    ]
    for (const b of defs) {
      const wx =
        b.hx +
        Math.sin(t * b.sp + b.ph) * 1.5 +
        Math.sin(t * 1.31 + b.ph * 2.7) * 0.45
      const wy =
        b.hy +
        Math.cos(t * b.sp * 0.83 + b.ph) * 1.1 +
        Math.sin(t * 1.13 + b.ph) * 0.35
      const flap = Math.abs(Math.sin(t * 16 + b.ph))
      const p = c.at(wx, wy)
      const bob = Math.sin(t * 3.1 + b.ph) * 2.2 * c.z

      // Sombra diminuta en el suelo.
      shadowEllipse(c.g, p.x + 1.5 * c.z, p.y + 1 * c.z, 3.4 * c.z, 1.5 * c.z, 0.12)

      const y = p.y - 26 * c.z + bob
      const wing = 3.4 * c.z
      g.fillStyle = b.col
      // Alas izquierdas y derechas (escalan con el aleteo).
      g.save()
      g.translate(p.x, y)
      for (const dir of [-1, 1]) {
        g.beginPath()
        g.moveTo(0, 0)
        g.ellipse(dir * wing * 0.62 * flap + dir * wing * 0.2, -wing * 0.18, wing * 0.72 * flap, wing * 0.5, dir * 0.5, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = withAlpha(b.col === '#f59e2c' ? '#c97b12' : '#b84a80', 0.9)
      }
      g.restore()
      // Cuerpo.
      g.strokeStyle = '#4a3626'
      g.lineWidth = 1.2 * c.z
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(p.x, y - wing * 0.55)
      g.lineTo(p.x, y + wing * 0.55)
      g.stroke()

      // Rastro de brillo ocasional.
      if (flap > 0.92) {
        g.fillStyle = withAlpha('#ffffff', 0.5)
        g.beginPath()
        g.arc(p.x, y - wing * 0.9, 0.9 * c.z, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
}
