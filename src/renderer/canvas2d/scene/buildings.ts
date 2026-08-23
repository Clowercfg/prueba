/**
 * Edificios de la granja dibujados por código (vector cartoon coherente).
 * Todos comparten: misma proyección, misma luz (arriba-izquierda), misma
 * dirección de sombra (abajo-derecha), misma paleta y mismo nivel de detalle
 * (zócalo, paredes dos caras, techo con grosor, puertas/ventanas, AO).
 *
 * Las POSICIONES vienen de las entidades existentes (farmEntities.ts):
 * aquí no se mueve ni un solo objeto del mundo.
 */
import type { FarmEntity } from '../../../game/entities/farmEntities'
import { PADS } from '../../../game/config/layoutConfig'
import { PAL, shade, withAlpha } from './palette'
import { unit } from './rng'
import {
  fillPoly,
  pt,
  shadowEllipse,
  strokePoly,
  type PaintCtx,
  type Vec2S,
} from './shapes'
import { PLOT_GROWTH_DEMO, drawPlot, traceRoundedIsoQuad } from './plots'

type Pad = { x0: number; y0: number; x1: number; y1: number }

/** Pinta las parcelas en la banda de tierra (orden #12: bajo todo objeto).
 *  growths: crecimiento real por parcela; por defecto, demo determinista.
 *  art: imagen opcional del lecho (se aplica a las 4 parcelas). */
export function drawPlotsGround(
  c: PaintCtx,
  growths?: readonly number[],
  art?: HTMLImageElement | null,
): void {
  const plots: Pad[] = [PADS.plotA, PADS.plotB, PADS.plotC, PADS.plotD]
  for (let k = 0; k < plots.length; k++) {
    drawPlot(c, plots[k], growths?.[k] ?? PLOT_GROWTH_DEMO[k] ?? 0, art)
  }
}

/**
 * Resplandor de selección para un edificio (granero/corral/casa): halo en el
 * suelo + contorno del pad. Se pinta POR FRAME bajo los objetos ordenables.
 */
export function drawBuildingSelection(c: PaintCtx, pad: Pad, tMs: number): void {
  const g = c.g
  const pulse = 0.5 + 0.5 * Math.sin(tMs / 320)
  const m = 0.34
  const x0 = pad.x0 - m
  const x1 = pad.x1 + 1 + m
  const y0 = pad.y0 - m
  const y1 = pad.y1 + 1 + m

  // Halo elíptico suave bajo la huella.
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const base = c.at(cx, cy)
  const rx = ((x1 - x0) * 32 * c.z) / 1.7
  const ry = ((y1 - y0) * 32 * c.z) / 3.4
  const grad = g.createRadialGradient(base.x, base.y, ry * 0.4, base.x, base.y, rx)
  grad.addColorStop(0, `rgba(255,224,138,${0.16 + 0.08 * pulse})`)
  grad.addColorStop(1, 'rgba(255,224,138,0)')
  g.fillStyle = grad
  g.save()
  g.translate(base.x, base.y)
  g.scale(1, ry / rx)
  g.beginPath()
  g.arc(0, 0, rx, 0, Math.PI * 2)
  g.restore()
  g.fill()

  // Contorno del pad.
  traceRoundedIsoQuad(c, x0, y0, x1, y1)
  g.strokeStyle = `rgba(255,236,170,${0.45 + 0.25 * pulse})`
  g.lineWidth = 2.6 * c.z
  g.stroke()
}

/**
 * Dibuja la entidad-edificio cuyo pintor es "mono-objeto". El corral se
 * divide en back/front y las parcelas van a la banda de tierra: ambos los
 * gestiona directamente SceneComposer (#12).
 */
export function drawFarmObject(c: PaintCtx, e: FarmEntity): 'barn' | null {
  if (e.key.endsWith('barn.png')) {
    drawBarn(c)
    return 'barn'
  }
  return null
}

/* ------------------------------------------------------------------ */
/* GRANERO                                                             */
/* ------------------------------------------------------------------ */

export function drawBarn(c: PaintCtx): void {
  const g = c.g
  const pad = PADS.barn
  const cx = (pad.x0 + pad.x1 + 1) / 2
  const cy = (pad.y0 + pad.y1 + 1) / 2
  const fw = pad.x1 + 1 - pad.x0 - 0.9
  const fd = pad.y1 + 1 - pad.y0 - 1.35
  const x0 = cx - fw / 2
  const x1 = cx + fw / 2
  const y0 = cy - fd / 2
  const y1 = cy + fd / 2

  const z = c.z
  const hFound = 7
  const hWall = 46
  const ov = 0.26

  // ---- Sombra global (luz arriba-izquierda → sombra abajo-derecha).
  const sc = c.at(cx + fw * 0.16, cy + fd * 0.12)
  shadowEllipse(g, sc.x + 10 * z, sc.y + 5 * z, (fw + fd) * 21 * z, (fw + fd) * 11 * z, 0.22)

  // ---- Zócalo de piedra.
  const fm = 0.17
  drawPrismWalls(c, x0 - fm, y0 - fm, x1 + fm, y1 + fm, 0, hFound, PAL.barn.stoneFound, PAL.barn.stoneFoundShade)

  // ---- Paredes (cara izquierda Y+ iluminada, cara derecha X+ en sombra).
  const wb = hFound
  const wt = hFound + hWall
  fillPoly(g, [pt(c, x0, y1, wb), pt(c, x1, y1, wb), pt(c, x1, y1, wt), pt(c, x0, y1, wt)], PAL.barn.wallLit)
  fillPoly(g, [pt(c, x1, y0, wb), pt(c, x1, y1, wb), pt(c, x1, y1, wt), pt(c, x1, y0, wt)], PAL.barn.wallShade)

  // Franjas horizontales sutilmente más oscuras (tablones).
  for (let k = 1; k < 4; k++) {
    const e = wb + (hWall * k) / 4
    strokePoly(g, [pt(c, x0, y1, e), pt(c, x1, y1, e)], withAlpha('#000000', 0.05), 1 * z)
    strokePoly(g, [pt(c, x1, y0, e), pt(c, x1, y1, e)], withAlpha('#000000', 0.07), 1 * z)
  }

  // Esquinas con listón crema.
  cornerTrim(g, c, x1, y1, wt)
  cornerTrim(g, c, x0, y1, wt)
  cornerTrim(g, c, x1, y0, wt)

  // ---- Puerta grande corredera (cara iluminada, mira al patio).
  const dw = 1.7
  const db = wb + 2
  const dt = wb + 34
  const dx0 = cx - dw / 2
  const dx1 = cx + dw / 2
  fillPoly(g, [pt(c, dx0, y1, db), pt(c, dx1, y1, db), pt(c, dx1, y1, dt), pt(c, dx0, y1, dt)], PAL.barn.doorPlank)
  // Listones verticales.
  for (let k = 1; k < 5; k++) {
    const lx = dx0 + (dw * k) / 5
    strokePoly(g, [pt(c, lx, y1, db + 0.5), pt(c, lx, y1, dt - 0.5)], PAL.barn.doorDark, 1.2 * z)
  }
  // Cruceta X.
  strokePoly(g, [pt(c, dx0, y1, db + 1), pt(c, dx1, y1, dt - 1)], PAL.barn.doorDark, 2.4 * z)
  strokePoly(g, [pt(c, dx1, y1, db + 1), pt(c, dx0, y1, dt - 1)], PAL.barn.doorDark, 2.4 * z)
  // Marco crema + raíl superior.
  strokeDoorFrame(g, c, dx0, dx1, y1, db, dt)
  strokePoly(g, [pt(c, dx0 - 0.14, y1, dt + 2), pt(c, dx1 + 0.14, y1, dt + 2)], PAL.barn.trim, 2.6 * z)
  // Ventanita de heno sobre la puerta.
  hayWindow(g, c, cx, y1, wt - 13, 0.62, 9)

  // ---- Ventanas con maceta (cara derecha en sombra).
  barnWindow(g, c, x1, cy - 1.15, wt)
  barnWindow(g, c, x1, cy + 1.15, wt)

  // ---- Techo a dos aguas con quincha (gambrel suave), caballete sobre wx.
  const hEave = wt + 2
  const hKnee = wt + hWall * 0.52
  const hPeak = wt + hWall * 0.98
  const yEave = y1 + ov
  const yKnee = cy + (fd / 2 + ov) * 0.48
  const xr0 = x0 - ov
  const xr1 = x1 + ov

  // Panel bajo (eave → knee), iluminado.
  fillPoly(
    g,
    [
      pt(c, xr0, yEave, hEave),
      pt(c, xr1, yEave, hEave),
      pt(c, xr1, yKnee, hKnee),
      pt(c, xr0, yKnee, hKnee),
    ],
    PAL.barn.roofLitLo,
  )
  // Panel alto (knee → cumbrera).
  fillPoly(
    g,
    [
      pt(c, xr0, yKnee, hKnee),
      pt(c, xr1, yKnee, hKnee),
      pt(c, xr1, cy, hPeak),
      pt(c, xr0, cy, hPeak),
    ],
    PAL.barn.roofLitHi,
  )
  // Textura de tejas: líneas siguiendo la pendiente.
  shingleLines(g, c, xr0, xr1, yEave, hEave, yKnee, hKnee, cy, hPeak)

  // Frontal (gable) en el extremo cercano x = xr1: triángulo de pared + madera.
  fillPoly(
    g,
    [
      pt(c, x1, y0, wt),
      pt(c, x1, y1, wt),
      pt(c, x1, cy, hPeak),
    ],
    PAL.barn.wallShade,
  )
  // Rake (borde inclinado del techo en el gable) con tabla crema.
  strokePoly(
    g,
    [
      pt(c, xr1, yEave, hEave),
      pt(c, xr1, yKnee, hKnee),
      pt(c, xr1, cy, hPeak),
    ],
    PAL.barn.trim,
    3 * z,
  )
  // Sombra interior bajo el alero del gable.
  fillPoly(
    g,
    [
      pt(c, x1, y0, wt - 0.5),
      pt(c, x1, y1, wt - 0.5),
      pt(c, x1, cy, hPeak - 2),
    ],
    withAlpha('#000000', 0.10),
  )

  // Pajarera del desván en el gable + viga con polea.
  loftDoor(g, c, x1, cy, wt, hPeak)
  strokePoly(g, [pt(c, x1 - 0.1, cy, hPeak - 7), pt(c, x1 + 0.62, cy, hPeak - 9)], PAL.barn.iron, 2.4 * z)
  strokePoly(g, [pt(c, x1 + 0.5, cy, hPeak - 8.6), pt(c, x1 + 0.5, cy, wt + 12)], withAlpha('#3a2f26', 0.8), 1 * z)
  g.fillStyle = PAL.barn.iron
  g.beginPath()
  g.arc(...pt2arr(ringPt(c, x1 + 0.5, cy, wt + 11)), 2 * z, 0, Math.PI * 2)
  g.fill()

  // Cumbrera y canal frontal.
  strokePoly(g, [pt(c, xr0, cy, hPeak), pt(c, xr1, cy, hPeak)], shade(PAL.barn.roofEdge, -0.15), 3.4 * z)
  strokePoly(g, [pt(c, xr0, yEave, hEave), pt(c, xr1, yEave, hEave)], PAL.barn.trim, 2.6 * z)

  // Veleta.
  weatherVane(g, c, cx, cy, hPeak)

  // AO donde las paredes se apoyan en el zócalo.
  strokePoly(g, [pt(c, x0, y1, wb + 0.4), pt(c, x1, y1, wb + 0.4)], withAlpha('#000000', 0.14), 2.4 * z)
  strokePoly(g, [pt(c, x1, y0, wb + 0.4), pt(c, x1, y1, wb + 0.4)], withAlpha('#000000', 0.16), 2.4 * z)
}

function ringPt(c: PaintCtx, x: number, y: number, e: number): Vec2S {
  return pt(c, x, y, e)
}

/** Caras visibles de un prisma rectangular (sin tapa). */
function drawPrismWalls(
  c: PaintCtx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  eb: number,
  et: number,
  colLeft: string,
  colRight: string,
): void {
  fillPoly(c.g, [pt(c, x0, y1, eb), pt(c, x1, y1, eb), pt(c, x1, y1, et), pt(c, x0, y1, et)], colLeft)
  fillPoly(c.g, [pt(c, x1, y0, eb), pt(c, x1, y1, eb), pt(c, x1, y1, et), pt(c, x1, y0, et)], colRight)
}

function cornerTrim(g: CanvasRenderingContext2D, c: PaintCtx, x: number, y: number, top: number): void {
  strokePoly(g, [pt(c, x, y, 2), pt(c, x, y, top - 1)], PAL.barn.trim, 3.2 * c.z)
}

function strokeDoorFrame(
  g: CanvasRenderingContext2D,
  c: PaintCtx,
  x0: number,
  x1: number,
  y: number,
  b: number,
  t: number,
): void {
  strokePoly(
    g,
    [
      pt(c, x0, y, b),
      pt(c, x0, y, t),
      pt(c, x1, y, t),
      pt(c, x1, y, b),
      pt(c, x0, y, b),
    ],
    PAL.barn.trim,
    2.6 * c.z,
  )
}

function hayWindow(
  g: CanvasRenderingContext2D,
  c: PaintCtx,
  x: number,
  y: number,
  centerElev: number,
  w: number,
  h: number,
): void {
  fillPoly(
    g,
    [pt(c, x - w / 2, y, centerElev - h / 2), pt(c, x + w / 2, y, centerElev - h / 2), pt(c, x + w / 2, y, centerElev + h / 2), pt(c, x - w / 2, y, centerElev + h / 2)],
    PAL.barn.loft,
  )
  strokePoly(
    g,
    [
      pt(c, x - w / 2, y, centerElev - h / 2),
      pt(c, x - w / 2, y, centerElev + h / 2),
      pt(c, x + w / 2, y, centerElev + h / 2),
      pt(c, x + w / 2, y, centerElev - h / 2),
      pt(c, x - w / 2, y, centerElev - h / 2),
    ],
    PAL.barn.trim,
    2 * c.z,
  )
  // Cruz de marco.
  strokePoly(g, [pt(c, x, y, centerElev - h / 2), pt(c, x, y, centerElev + h / 2)], PAL.barn.trim, 1.2 * c.z)
}

function barnWindow(g: CanvasRenderingContext2D, c: PaintCtx, x: number, y: number, wt: number): void {
  const w = 0.56
  const b = wt - 24
  const t = wt - 10
  // Persianas.
  fillPoly(
    g,
    [pt(c, x, y - w * 0.95, b - 0.5), pt(c, x, y - w * 0.45, b - 0.5), pt(c, x, y - w * 0.45, t + 0.5), pt(c, x, y - w * 0.95, t + 0.5)],
    shade(PAL.barn.wallShade, -0.15),
  )
  fillPoly(
    g,
    [pt(c, x, y + w * 0.45, b - 0.5), pt(c, x, y + w * 0.95, b - 0.5), pt(c, x, y + w * 0.95, t + 0.5), pt(c, x, y + w * 0.45, t + 0.5)],
    shade(PAL.barn.wallShade, -0.15),
  )
  hayWindow(g, c, x, y, (b + t) / 2, w, t - b)
  // Maceta con flores.
  const bb = b - 4
  fillPoly(
    g,
    [pt(c, x, y - w * 0.7, bb - 4), pt(c, x, y + w * 0.7, bb - 4), pt(c, x, y + w * 0.7, bb), pt(c, x, y - w * 0.7, bb)],
    PAL.pen.woodShade,
  )
  for (let k = -1; k <= 1; k++) {
    const fx = x
    const fy = y + k * w * 0.4
    const fe = bb + 1
    g.fillStyle = PAL.flora.oakMid
    g.beginPath()
    g.arc(...pt2arr(pt(c, fx, fy, fe + 1.6)), 2.1 * c.z, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = k === 0 ? PAL.flowers.petals[1] : PAL.flowers.petals[2]
    g.beginPath()
    g.arc(...pt2arr(pt(c, fx, fy, fe + 3)), 1.5 * c.z, 0, Math.PI * 2)
    g.fill()
  }
}

function pt2arr(p: Vec2S): [number, number] {
  return [p.x, p.y]
}

/** Líneas de teja paralelas a la pendiente frontal. */
function shingleLines(
  g: CanvasRenderingContext2D,
  c: PaintCtx,
  x0: number,
  x1: number,
  ye: number,
  he: number,
  yk: number,
  hk: number,
  yr: number,
  hr: number,
): void {
  g.strokeStyle = withAlpha('#000000', 0.07)
  g.lineWidth = 1 * c.z
  g.beginPath()
  for (let k = 1; k <= 3; k++) {
    const f = k / 4
    const ya = ye + (yk - ye) * f
    const ha = he + (hk - he) * f
    g.moveTo(...pt2arr(pt(c, x0, ya, ha)))
    g.lineTo(...pt2arr(pt(c, x1, ya, ha)))
  }
  for (let k = 1; k <= 2; k++) {
    const f = k / 3
    const ya = yk + (yr - yk) * f
    const ha = hk + (hr - hk) * f
    g.moveTo(...pt2arr(pt(c, x0, ya, ha)))
    g.lineTo(...pt2arr(pt(c, x1, ya, ha)))
  }
  g.stroke()
}

function loftDoor(
  g: CanvasRenderingContext2D,
  c: PaintCtx,
  x: number,
  yc: number,
  wt: number,
  hPeak: number,
): void {
  const w = 0.72
  const b = wt + 6
  const t = Math.min(hPeak - 6, wt + 24)
  fillPoly(
    g,
    [pt(c, x, yc - w / 2, b), pt(c, x, yc + w / 2, b), pt(c, x, yc + w / 2, t), pt(c, x, yc - w / 2, t)],
    PAL.barn.loft,
  )
  strokePoly(
    g,
    [
      pt(c, x, yc - w / 2, b),
      pt(c, x, yc - w / 2, t),
      pt(c, x, yc + w / 2, t),
      pt(c, x, yc + w / 2, b),
      pt(c, x, yc - w / 2, b),
    ],
    PAL.barn.trim,
    2 * c.z,
  )
  strokePoly(g, [pt(c, x, yc - w / 2, b), pt(c, x, yc + w / 2, t)], PAL.barn.trim, 1.4 * c.z)
  strokePoly(g, [pt(c, x, yc + w / 2, b), pt(c, x, yc - w / 2, t)], PAL.barn.trim, 1.4 * c.z)
}

function weatherVane(g: CanvasRenderingContext2D, c: PaintCtx, x: number, y: number, base: number): void {
  strokePoly(g, [pt(c, x, y, base), pt(c, x, y, base + 15)], PAL.barn.iron, 1.8 * c.z)
  const tip = pt(c, x, y, base + 15)
  g.strokeStyle = PAL.barn.iron
  g.lineWidth = 1.6 * c.z
  g.beginPath()
  g.moveTo(tip.x - 6 * c.z, tip.y)
  g.lineTo(tip.x + 6 * c.z, tip.y)
  g.stroke()
  g.beginPath()
  g.moveTo(tip.x + 6 * c.z, tip.y)
  g.lineTo(tip.x + 2.5 * c.z, tip.y - 2.4 * c.z)
  g.lineTo(tip.x + 2.5 * c.z, tip.y + 2.4 * c.z)
  g.closePath()
  g.fillStyle = PAL.barn.iron
  g.fill()
  g.beginPath()
  g.arc(tip.x, tip.y - 2.6 * c.z, 1.7 * c.z, 0, Math.PI * 2)
  g.fillStyle = shade(PAL.barn.iron, 0.25)
  g.fill()
}

/* ------------------------------------------------------------------ */
/* CASA                                                                */
/* ------------------------------------------------------------------ */

export function drawHouse(c: PaintCtx): void {
  const g = c.g
  const pad = PADS.house
  const cx = (pad.x0 + pad.x1 + 1) / 2
  const cy = (pad.y0 + pad.y1 + 1) / 2
  const fw = pad.x1 + 1 - pad.x0 - 1.05
  const fd = pad.y1 + 1 - pad.y0 - 1.5
  const x0 = cx - fw / 2
  const x1 = cx + fw / 2
  const y0 = cy - fd / 2
  const y1 = cy + fd / 2

  const z = c.z
  const hFound = 5
  const hWall = 34
  const ov = 0.24

  // Sombra global coherente con el granero.
  const sc = c.at(cx + fw * 0.16, cy + fd * 0.12)
  shadowEllipse(g, sc.x + 8 * z, sc.y + 4 * z, (fw + fd) * 19 * z, (fw + fd) * 10 * z, 0.2)

  // Zócalo de piedra.
  const fm = 0.15
  drawPrismWalls(c, x0 - fm, y0 - fm, x1 + fm, y1 + fm, 0, hFound, PAL.house.stoneFound, PAL.house.stoneFoundShade)

  // Paredes de encalado: Y+ iluminada, X+ en sombra.
  const wb = hFound
  const wt = hFound + hWall
  fillPoly(g, [pt(c, x0, y1, wb), pt(c, x1, y1, wb), pt(c, x1, y1, wt), pt(c, x0, y1, wt)], PAL.house.wallLit)
  fillPoly(g, [pt(c, x1, y0, wb), pt(c, x1, y1, wb), pt(c, x1, y1, wt), pt(c, x1, y0, wt)], PAL.house.wallShade)

  // Esquinas con listón crema.
  cornerTrim(g, c, x1, y1, wt)
  cornerTrim(g, c, x0, y1, wt)
  cornerTrim(g, c, x1, y0, wt)

  // Puerta de madera con marco y peldaño (cara iluminada).
  const dw = 0.85
  const db = wb + 1.5
  const dt = wb + 26
  const dx0 = cx - dw / 2 - 0.55
  const dx1 = cx + dw / 2 - 0.55
  fillPoly(g, [pt(c, dx0, y1, db), pt(c, dx1, y1, db), pt(c, dx1, y1, dt), pt(c, dx0, y1, dt)], PAL.house.door)
  strokePoly(g, [pt(c, dx0 + dw * 0.5, y1, db), pt(c, dx0 + dw * 0.5, y1, dt)], PAL.house.doorDark, 1.2 * z)
  strokeDoorFrame(g, c, dx0, dx1, y1, db, dt)
  // Peldaño.
  fillPoly(
    g,
    [pt(c, dx0 - 0.12, y1 + 0.16, 0), pt(c, dx1 + 0.12, y1 + 0.16, 0), pt(c, dx1 + 0.12, y1 + 0.28, 3), pt(c, dx0 - 0.12, y1 + 0.28, 3)],
    PAL.barn.stoneFound,
  )
  // Picaporte.
  g.fillStyle = PAL.barn.iron
  g.beginPath()
  g.arc(...pt2arr(pt(c, dx1 - 0.14, y1, db + 11)), 1.4 * z, 0, Math.PI * 2)
  g.fill()

  // Ventana con maceta junto a la puerta (cara iluminada).
  hayWindow(g, c, cx + 1.05, y1, wb + 15, 0.72, 10)
  flowerBox(g, c, cx + 1.05, y1, wb + 20.5)

  // Ventanas con persianas en la cara en sombra.
  barnWindow(g, c, x1, cy - 0.75, wt)
  barnWindow(g, c, x1, cy + 0.9, wt)

  // Techo a dos aguas de teja terracota.
  const hEave = wt + 2
  const hPeak = wt + 33
  const yEave = y1 + ov
  const xr0 = x0 - ov
  const xr1 = x1 + ov

  fillPoly(g, [pt(c, xr0, yEave, hEave), pt(c, xr1, yEave, hEave), pt(c, xr1, cy, hPeak), pt(c, xr0, cy, hPeak)], PAL.house.roofLitLo)
  shingleLines(g, c, xr0, xr1, yEave, hEave, cy, hPeak, cy, hPeak)
  // Frontal (gable) crema.
  fillPoly(g, [pt(c, x1, y0, wt), pt(c, x1, y1, wt), pt(c, x1, cy, hPeak)], PAL.house.wallShade)
  strokePoly(g, [pt(c, xr1, yEave, hEave), pt(c, xr1, cy, hPeak)], PAL.house.trim, 2.6 * z)
  fillPoly(g, [pt(c, x1, y0, wt - 0.5), pt(c, x1, y1, wt - 0.5), pt(c, x1, cy, hPeak - 2)], withAlpha('#000000', 0.08))

  // Chimenea de piedra en la cumbrera.
  const chX = cx - fw * 0.22
  const chW = 0.34
  const chB = hPeak - 12
  const chT = hPeak + 9
  fillPoly(g, [pt(c, chX - chW, cy - chW * 0.7, chB), pt(c, chX + chW, cy - chW * 0.7, chB), pt(c, chX + chW, cy - chW * 0.7, chT), pt(c, chX - chW, cy - chW * 0.7, chT)], PAL.house.chimney)
  fillPoly(g, [pt(c, chX + chW, cy - chW * 0.7, chB), pt(c, chX + chW, cy + chW * 0.7, chB), pt(c, chX + chW, cy + chW * 0.7, chT), pt(c, chX + chW, cy - chW * 0.7, chT)], PAL.house.chimneyDark)
  fillPoly(g, [pt(c, chX - chW - 0.08, cy - chW * 0.8, chT), pt(c, chX + chW + 0.08, cy - chW * 0.8, chT), pt(c, chX + chW + 0.08, cy + chW * 0.8, chT), pt(c, chX - chW - 0.08, cy + chW * 0.8, chT)], shade(PAL.house.chimneyDark, -0.2))

  // Cumbrera y canal frontal.
  strokePoly(g, [pt(c, xr0, cy, hPeak), pt(c, xr1, cy, hPeak)], shade(PAL.house.roofEdge, -0.15), 3 * z)
  strokePoly(g, [pt(c, xr0, yEave, hEave), pt(c, xr1, yEave, hEave)], PAL.house.trim, 2.4 * z)

  // AO del apoyo.
  strokePoly(g, [pt(c, x0, y1, wb + 0.4), pt(c, x1, y1, wb + 0.4)], withAlpha('#000000', 0.13), 2.2 * z)
  strokePoly(g, [pt(c, x1, y0, wb + 0.4), pt(c, x1, y1, wb + 0.4)], withAlpha('#000000', 0.15), 2.2 * z)
}

/** Jardinera colgante bajo una ventana (misma que barnWindow, reutilizable). */
function flowerBox(g: CanvasRenderingContext2D, c: PaintCtx, x: number, y: number, elev: number): void {
  fillPoly(
    g,
    [pt(c, x - 0.42, y, elev - 4), pt(c, x + 0.42, y, elev - 4), pt(c, x + 0.42, y, elev), pt(c, x - 0.42, y, elev)],
    PAL.pen.woodShade,
  )
  for (let k = -1; k <= 1; k++) {
    const fe = elev + 1.4
    g.fillStyle = PAL.flora.oakMid
    g.beginPath()
    g.arc(...pt2arr(pt(c, x + k * 0.22, y, fe)), 1.8 * c.z, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = k === 0 ? PAL.flowers.petals[1] : PAL.flowers.petals[2]
    g.beginPath()
    g.arc(...pt2arr(pt(c, x + k * 0.22, y, fe + 1.4)), 1.3 * c.z, 0, Math.PI * 2)
    g.fill()
  }
}

/* ------------------------------------------------------------------ */
/* CORRAL (valla de madera con puerta)                                 */
/* Dividido en DOS mitades para depth-sort real (#12):                 */
/*   'back'  = vallas norte/este-lejano (+ puerta)   sortY bajo        */
/*   'front' = vallas sur/cercano + bebedero         sortY alto        */
/* Un animal dentro del corral se ordena ENTRE ambas → queda detrás de */
/* la valla frontal y delante de la trasera, como en el 2.5D real.     */
/* ------------------------------------------------------------------ */

export type PenPart = 'back' | 'front'

export function drawPen(c: PaintCtx, pad: Pad, part: PenPart): void {
  const inset = 0.22
  const x0 = pad.x0 + inset
  const x1 = pad.x1 + 1 - inset
  const y0 = pad.y0 + inset
  const y1 = pad.y1 + 1 - inset

  const gateW = 1.0
  const gateCx = (x0 + x1) / 2

  if (part === 'back') {
    // Valla trasera (arriba): borde y0 con hueco de puerta, luego borde x0.
    fenceRun(c, x0, y0, gateCx - gateW / 2, y0, true)
    fenceRun(c, gateCx + gateW / 2, y0, x1, y0, true)
    fenceRun(c, x0, y0, x0, y1, true)
    // Puerta abierta hacia adentro.
    penGate(c, gateCx - gateW / 2, y0, gateW)
    return
  }

  // FRONT: bebedero primero (queda dentro), vallas cercanas después.
  trough(c, x0 + 0.85, y1 - 0.7)
  fenceRun(c, x1, y0, x1, y1, false)
  fenceRun(c, x0, y1, x1, y1, false)
}

/** Suelo pisado del corral: pertenece a la banda de tierra (#12). */
export function drawPenFloor(c: PaintCtx, pad: Pad): void {
  const inset = 0.22
  penInterior(
    c,
    pad.x0 + inset,
    pad.x1 + 1 - inset,
    pad.y0 + inset,
    pad.y1 + 1 - inset,
  )
}

function penInterior(c: PaintCtx, x0: number, x1: number, y0: number, y1: number): void {
  const g = c.g
  for (let n = 0; n < 5; n++) {
    const px = x0 + 0.4 + unit(n, 3, 901) * (x1 - x0 - 0.8)
    const py = y0 + 0.4 + unit(n, 7, 902) * (y1 - y0 - 0.8)
    const s = c.at(px, py)
    g.strokeStyle = PAL.dirt.straw
    g.lineWidth = 1.2 * c.z
    g.lineCap = 'round'
    g.beginPath()
    const a = unit(n, 11, 903) * Math.PI
    g.moveTo(s.x - Math.cos(a) * 3 * c.z, s.y - Math.sin(a) * 1.5 * c.z)
    g.lineTo(s.x + Math.cos(a) * 3 * c.z, s.y + Math.sin(a) * 1.5 * c.z)
    g.stroke()
  }
  // Tierra removida (manchas sutiles).
  for (let n = 0; n < 4; n++) {
    const px = x0 + 0.4 + unit(n, 13, 904) * (x1 - x0 - 0.8)
    const py = y0 + 0.4 + unit(n, 17, 905) * (y1 - y0 - 0.8)
    const s = c.at(px, py)
    g.fillStyle = 'rgba(90,60,35,0.10)'
    g.beginPath()
    g.ellipse(s.x, s.y, 7 * c.z, 3.4 * c.z, 0, 0, Math.PI * 2)
    g.fill()
  }
}

function postAt(c: PaintCtx, wx: number, wy: number, hPx: number): void {
  const g = c.g
  const p = c.at(wx, wy)
  shadowEllipse(g, p.x + 2 * c.z, p.y + 1 * c.z, 4.6 * c.z, 2.1 * c.z, 0.16)
  const w = 2.1 * c.z
  g.fillStyle = PAL.pen.woodLit
  g.fillRect(p.x - w, p.y - hPx, w * 1.55, hPx)
  g.fillStyle = PAL.pen.woodShade
  g.fillRect(p.x - w * 0.1, p.y - hPx, w * 0.62, hPx)
  g.fillStyle = shade(PAL.pen.woodLit, 0.25)
  g.beginPath()
  g.ellipse(p.x - w * 0.22, p.y - hPx, w * 0.85, w * 0.4, 0, 0, Math.PI * 2)
  g.fill()
}

function railBetween(c: PaintCtx, ax: number, ay: number, bx: number, by: number, elevPx: number, back: boolean): void {
  const g = c.g
  const a = pt(c, ax, ay, elevPx)
  const b = pt(c, bx, by, elevPx)
  g.strokeStyle = back ? shade(PAL.pen.woodMid, -0.12) : PAL.pen.woodMid
  g.lineWidth = 3.2 * c.z
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(a.x, a.y)
  g.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 1.6 * c.z, b.x, b.y)
  g.stroke()
}

function fenceRun(c: PaintCtx, ax: number, ay: number, bx: number, by: number, back: boolean): void {
  const len = Math.hypot(bx - ax, by - ay)
  const n = Math.max(1, Math.round(len / 1.05))
  for (let k = 0; k <= n; k++) {
    const t = k / n
    postAt(c, ax + (bx - ax) * t, ay + (by - ay) * t, 20 * c.z)
  }
  railBetween(c, ax, ay, bx, by, 14 * c.z, back)
  railBetween(c, ax, ay, bx, by, 6.5 * c.z, back)
}

function penGate(c: PaintCtx, hx: number, hy: number, wu: number): void {
  const g = c.g
  // Hoja abierta hacia adentro (-y es afuera; abre girando al patio).
  const ex = hx + wu * 0.35
  const ey = hy + wu * 0.78
  const h = pt(c, hx, hy, 15 * c.z)
  const e = pt(c, ex, ey, 15 * c.z)
  g.strokeStyle = PAL.pen.woodLit
  g.lineWidth = 3 * c.z
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(h.x, h.y)
  g.lineTo(e.x, e.y)
  g.stroke()
  g.strokeStyle = PAL.pen.woodMid
  g.lineWidth = 2.2 * c.z
  const mid = pt(c, (hx + ex) / 2, (hy + ey) / 2, 6.5 * c.z)
  g.beginPath()
  g.moveTo(h.x, h.y - 8.5 * c.z)
  g.lineTo(mid.x, mid.y)
  g.lineTo(e.x, e.y - 8.5 * c.z)
  g.stroke()
  // Poste de bisagra más alto.
  postAt(c, hx, hy, 23 * c.z)
}

function trough(c: PaintCtx, wx: number, wy: number): void {
  const g = c.g
  const hw = 0.4
  const hd = 0.19
  const h = 6
  // Sombra base.
  const base = c.at(wx, wy)
  shadowEllipse(g, base.x + 3 * c.z, base.y + 1.5 * c.z, wu30(hw) * c.z, wu15(hw) * c.z, 0.15)
  // Caras exteriores (frontal y derecha).
  fillPoly(
    g,
    [
      pt(c, wx - hw, wy + hd, 0),
      pt(c, wx + hw, wy + hd, 0),
      pt(c, wx + hw, wy + hd, h),
      pt(c, wx - hw, wy + hd, h),
    ],
    PAL.pen.trough,
  )
  fillPoly(
    g,
    [
      pt(c, wx + hw, wy - hd, 0),
      pt(c, wx + hw, wy + hd, 0),
      pt(c, wx + hw, wy + hd, h),
      pt(c, wx + hw, wy - hd, h),
    ],
    shade(PAL.pen.trough, -0.18),
  )
  // Tapa con agua brillando.
  fillPoly(
    g,
    [pt(c, wx - hw, wy - hd, h), pt(c, wx + hw, wy - hd, h), pt(c, wx + hw, wy + hd, h), pt(c, wx - hw, wy + hd, h)],
    PAL.pen.woodMid,
  )
  const top = pt(c, wx, wy + hd * 0.25, h)
  g.fillStyle = '#7cc7e8'
  g.beginPath()
  g.ellipse(top.x, top.y, hw * 26 * c.z, hw * 12 * c.z, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(255,255,255,0.5)'
  g.beginPath()
  g.ellipse(top.x - hw * 8 * c.z, top.y - hw * 3 * c.z, hw * 9 * c.z, hw * 3.4 * c.z, -0.4, 0, Math.PI * 2)
  g.fill()
}

function wu30(v: number): number {
  return v * 30
}
function wu15(v: number): number {
  return v * 15
}

