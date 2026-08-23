/**
 * HUERTOS: bancales EXCAVADOS en la tierra, integrados al terreno.
 * Crecimiento del cultivo (0→1):
 *   0.00 tierra arada · 0.12 brotes · 0.35 plantas ·
 *   0.65 tallos altos · 0.90 cultivo dorado listo para cosechar
 *
 * NOTA de integración: el crecimiento es hoy una demo determinista por
 * parcela; cuando exista estado real de cultivos basta mapear
 * growth = store → drawPlot(c, pad, growth) sin tocar nada más.
 */

import { PAL, shade, withAlpha } from './palette'
import { unit } from './rng'
import { pt, type PaintCtx } from './shapes'

type Pad = { x0: number; y0: number; x1: number; y1: number }

/** Demo determinista: las 4 parcelas muestran 4 fases distintas del ciclo. */
export const PLOT_GROWTH_DEMO = [0.04, 0.27, 0.58, 0.93] as const

const CROP = {
  sprout: '#a8d97c',
  plant: '#63b04a',
  stalkGreen: '#79b344',
  gold: '#dcb84f',
  goldDeep: '#c2a13c',
} as const

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Mezcla dos colores hex (t=0 → a, t=1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t))
  const gg = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t))
  const bl = Math.round(lerp(pa & 255, pb & 255, t))
  return `rgb(${r},${gg},${bl})`
}

/**
 * Quad isométrico con esquinas redondeadas: deja el trazado BEGIN en ctx;
 * el llamador decide fill()/stroke()/clip().
 */
export function traceRoundedIsoQuad(
  c: PaintCtx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const g = c.g
  const corners: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
  g.beginPath()
  for (let k = 0; k < 4; k++) {
    const [cxk, cyk] = corners[k]
    const [pxk, pyk] = corners[(k + 3) % 4]
    const [nxk, nyk] = corners[(k + 1) % 4]
    const a = pt(c, lerp(cxk, pxk, 0.3), lerp(cyk, pyk, 0.3), 0)
    const b = pt(c, cxk, cyk, 0)
    const d = pt(c, lerp(cxk, nxk, 0.3), lerp(cyk, nyk, 0.3), 0)
    if (k === 0) {
      const start = pt(c, (x0 + x1) / 2, y0, 0)
      g.moveTo(start.x, start.y)
    }
    g.lineTo(a.x, a.y)
    g.quadraticCurveTo(b.x, b.y, d.x, d.y)
  }
  g.closePath()
}

/** Dibuja un bancal excavado con cultivo según crecimiento (0..1). */
export function drawPlot(c: PaintCtx, pad: Pad, growth: number): void {
  const g = c.g
  const z = c.z
  const inset = 0.08
  const x0 = pad.x0 + inset
  const x1 = pad.x1 + 1 - inset
  const y0 = pad.y0 + inset
  const y1 = pad.y1 + 1 - inset

  // ---- 1) Borde de tierra (berma) que funde con el prado.
  traceRoundedIsoQuad(c, x0 - 0.24, y0 - 0.2, x1 + 0.24, y1 + 0.22)
  g.fillStyle = mixHex('#b28c5f', '#93b066', 0.28)
  g.fill()

  // ---- 2) Lecho hundido (excavación).
  traceRoundedIsoQuad(c, x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04)
  g.fillStyle = PAL.soil.dark
  g.fill()

  // Sombra interna: la pared lejana queda en sombra (luz arriba-izquierda).
  g.save()
  traceRoundedIsoQuad(c, x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04)
  g.clip()
  g.strokeStyle = 'rgba(0,0,0,0.30)'
  g.lineWidth = 5 * z
  traceRoundedIsoQuad(c, x0 - 0.07, y0 - 0.08, x1 - 0.02, y1 + 0.02)
  g.stroke()
  // Labio iluminado en la orilla cercana.
  g.strokeStyle = withAlpha('#ecd7a5', 0.4)
  g.lineWidth = 3 * z
  traceRoundedIsoQuad(c, x0 + 0.08, y0 + 0.12, x1 + 0.05, y1 + 0.09)
  g.stroke()
  g.restore()

  // Humedad: tierra recién arada más oscura.
  if (growth < 0.55) {
    traceRoundedIsoQuad(c, x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04)
    g.fillStyle = withAlpha('#241407', 0.15 * (1 - growth / 0.55))
    g.fill()
  }

  // ---- 3) Surcos ondulados paralelos al eje x.
  const rows = 4
  g.strokeStyle = PAL.soil.furrow
  g.lineWidth = 2.6 * z
  g.lineCap = 'round'
  g.beginPath()
  for (let k = 0; k < rows; k++) {
    const fy = y0 + ((y1 - y0) * (k + 0.5)) / rows
    const wob = (unit(pad.x0 * 7 + k, pad.y0, 933) - 0.5) * 0.07
    const a = pt(c, x0 + 0.14, fy, 0)
    const b = pt(c, x1 - 0.14, fy, 0)
    const m = pt(c, (x0 + x1) / 2, fy + wob, 0)
    g.moveTo(a.x, a.y)
    g.quadraticCurveTo(m.x, m.y, b.x, b.y)
  }
  g.stroke()

  // ---- 4) Detritus mínimos del bancal (pajitas y piedrita).
  for (let n = 0; n < 3; n++) {
    const px = x0 + 0.25 + unit(n, 19, 941) * (x1 - x0 - 0.5)
    const py = y0 + 0.18 + unit(n, 23, 942) * (y1 - y0 - 0.36)
    const s = c.at(px, py)
    if (n === 0) {
      g.fillStyle = PAL.dirt.pebble
      g.beginPath()
      g.ellipse(s.x, s.y, 1.7 * z, 1.1 * z, 0, 0, Math.PI * 2)
      g.fill()
    } else {
      g.strokeStyle = withAlpha('#d9bc8e', 0.7)
      g.lineWidth = 1 * z
      g.beginPath()
      g.moveTo(s.x - 2 * z, s.y)
      g.lineTo(s.x + 2 * z, s.y - 0.8 * z)
      g.stroke()
    }
  }

  // ---- 5) Cultivo por etapas sobre una rejilla determinista compartida.
  if (growth >= 0.12) {
    const colsN = 6
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < colsN; col++) {
        // Progreso local: bordes antes que el centro (crecimiento orgánico).
        const radial = 1 - Math.abs(col - (colsN - 1) / 2) / ((colsN - 1) / 2)
        const localG = Math.min(1, growth + radial * 0.06)
        if (localG < 0.12) continue
        const seed = unit(pad.x0 * 13 + row * 3, pad.y0 * 7 + col, 951)
        const wx = x0 + 0.26 + ((x1 - x0 - 0.52) * col) / (colsN - 1) + (seed - 0.5) * 0.1
        const wy = y0 + 0.16 + ((y1 - y0 - 0.32) * row) / (rows - 1) + (unit(col, row, 952) - 0.5) * 0.08
        drawCropAt(c, wx, wy, seed, localG)
      }
    }
  }
}

/** Anillo de selección sobre el bancal (se pinta por frame, bajo objetos). */
export function drawPlotSelection(c: PaintCtx, pad: Pad, tMs: number): void {
  const g = c.g
  const pulse = 0.5 + 0.5 * Math.sin(tMs / 320)
  const inset = 0.08
  const x0 = pad.x0 + inset - 0.16
  const x1 = pad.x1 + 1 - inset + 0.16
  const y0 = pad.y0 + inset - 0.14
  const y1 = pad.y1 + 1 - inset + 0.14

  // Resplandor cálido dentro del bancal.
  g.save()
  traceRoundedIsoQuad(c, x0, y0, x1, y1)
  g.clip()
  const a = pt(c, x0, y0)
  const b = pt(c, x1, y1)
  const grad = g.createLinearGradient(a.x, a.y, b.x, b.y)
  grad.addColorStop(0, `rgba(255,224,138,${0.10 + 0.06 * pulse})`)
  grad.addColorStop(1, 'rgba(255,224,138,0)')
  g.fillStyle = grad
  g.fillRect(Math.min(a.x, b.x) - 8 * c.z, Math.min(a.y, b.y) - 8 * c.z, Math.abs(b.x - a.x) + 16 * c.z, Math.abs(b.y - a.y) + 16 * c.z)
  g.restore()

  // Contorno doble suave.
  traceRoundedIsoQuad(c, x0, y0, x1, y1)
  g.strokeStyle = `rgba(255,236,170,${0.55 + 0.25 * pulse})`
  g.lineWidth = 2.6 * c.z
  g.stroke()
  traceRoundedIsoQuad(c, x0 - 0.09, y0 - 0.08, x1 + 0.09, y1 + 0.09)
  g.strokeStyle = `rgba(120,72,20,${0.20 + 0.10 * pulse})`
  g.lineWidth = 1.2 * c.z
  g.stroke()
}

/** Un cultivo individual según su progreso 0..1. */
function drawCropAt(c: PaintCtx, wx: number, wy: number, seed: number, gr: number): void {
  const g = c.g
  const z = c.z
  const base = c.at(wx, wy)
  const lean = (seed - 0.5) * 0.35

  // Contacto con la tierra.
  g.fillStyle = 'rgba(20,10,4,0.22)'
  g.beginPath()
  g.ellipse(base.x, base.y + 0.5 * z, 2.2 * z, 1 * z, 0, 0, Math.PI * 2)
  g.fill()

  if (gr < 0.35) {
    // BROTES: par de hojitas pálidas recién salidas.
    const hgt = lerp(1.6, 3.4, (gr - 0.12) / 0.23) * z
    g.fillStyle = CROP.sprout
    g.beginPath()
    g.ellipse(base.x - 1.1 * z, base.y - hgt, 1.3 * z, hgt * 0.75, -0.5, 0, Math.PI * 2)
    g.ellipse(base.x + 1.1 * z, base.y - hgt, 1.3 * z, hgt * 0.75, 0.5, 0, Math.PI * 2)
    g.fill()
    return
  }

  if (gr < 0.65) {
    // PLANTAS: mata pequeña de 3 hojas.
    const s = lerp(2.4, 4.2, (gr - 0.35) / 0.3) * z
    g.strokeStyle = shade(CROP.plant, -0.25)
    g.lineWidth = 1 * z
    g.beginPath()
    g.moveTo(base.x, base.y)
    g.lineTo(base.x, base.y - s)
    g.stroke()
    g.fillStyle = CROP.plant
    g.beginPath()
    g.ellipse(base.x - s * 0.55, base.y - s * 0.9, s * 0.55, s * 0.3, -0.7, 0, Math.PI * 2)
    g.ellipse(base.x + s * 0.55, base.y - s * 0.9, s * 0.55, s * 0.3, 0.7, 0, Math.PI * 2)
    g.ellipse(base.x, base.y - s * 1.25, s * 0.34, s * 0.55, 0, 0, Math.PI * 2)
    g.fill()
    return
  }

  // TALLOS ALTOS → DORADOS (trigo).
  const ripen = Math.min(1, Math.max(0, (gr - 0.65) / 0.3))
  const stalkCol = mixHex(CROP.stalkGreen, CROP.goldDeep, ripen * 0.85)
  const hgt = lerp(11, 17, (gr - 0.65) / 0.35) * z
  const tipX = base.x + lean * hgt * 0.5
  const tipY = base.y - hgt

  // Tallo curvado.
  g.strokeStyle = stalkCol
  g.lineWidth = Math.max(1, 1.4 * z)
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(base.x, base.y)
  g.quadraticCurveTo(base.x + lean * hgt * 0.2, base.y - hgt * 0.6, tipX, tipY)
  g.stroke()

  // Dos hojas en el tallo.
  g.strokeStyle = mixHex(CROP.stalkGreen, CROP.gold, ripen * 0.6)
  g.lineWidth = Math.max(0.9, 1.1 * z)
  g.beginPath()
  g.moveTo(base.x + lean * 1, base.y - hgt * 0.35)
  g.quadraticCurveTo(base.x - 2.6 * z, base.y - hgt * 0.5, base.x - 4 * z, base.y - hgt * 0.42)
  g.moveTo(base.x + lean * 1.6, base.y - hgt * 0.55)
  g.quadraticCurveTo(base.x + 3 * z, base.y - hgt * 0.72, base.x + 4.4 * z, base.y - hgt * 0.66)
  g.stroke()

  // Espiga dorada al madurar.
  if (ripen > 0.25) {
    const headLen = lerp(2.6, 4.4, ripen) * z
    g.fillStyle = mixHex('#c9b34a', CROP.gold, ripen)
    g.save()
    g.translate(tipX, tipY)
    g.rotate(lean * 0.5)
    g.beginPath()
    g.ellipse(0, -headLen * 0.4, headLen * 0.34, headLen * 0.62, 0, 0, Math.PI * 2)
    g.fill()
    // Barbas.
    g.strokeStyle = withAlpha('#efd98a', 0.85)
    g.lineWidth = 0.7 * z
    g.beginPath()
    for (const dx of [-1, 0, 1]) {
      g.moveTo(dx * headLen * 0.2, -headLen * 0.7)
      g.lineTo(dx * headLen * 0.38, -headLen * 1.25)
    }
    g.stroke()
    g.restore()
  }
}
