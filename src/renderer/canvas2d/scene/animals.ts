/**
 * ANIMALES: representacion 100% visual, desconectada de la logica.
 *
 * - Los sprites son procedurales y se cachean en canvases offscreen por
 *   (especie x estado x frame): nada complejo se redibuja por frame.
 * - Solo se dibujan mirando a la derecha; el espejo se aplica al blitear.
 * - La capa ambiente mueve animales decorativos (1 vaca en el corral,
 *   3 gallinas en el patio del granero) con rutas deterministas.
 *
 * SEAM para datos reales: cuando existan animales en el store basta con
 * construir AnimalView[] desde el estado del juego y llamar drawViews()
 * sin tocar sprites ni cache.
 */

import { PADS } from '../../../game/config/layoutConfig'
import { unit } from './rng'
import type { PaintCtx } from './shapes'

export type Species = 'cow' | 'chicken'
export type AnimalState = 'walk' | 'idle' | 'graze' | 'peck'

/** Vista minima de un animal; el futuro store del juego alimenta esto. */
export interface AnimalView {
  id: string
  species: Species
  /** Posicion en unidades de mundo (tiles). */
  x: number
  y: number
  /** 1 = mira a iso-derecha, -1 = espejado. */
  facing: 1 | -1
  state: AnimalState
}

const FRAME_MS: Record<AnimalState, number> = {
  walk: 170,
  idle: 480,
  graze: 380,
  peck: 240,
}

/* ------------------------------------------------------------------ */
/* Cache de sprites                                                    */
/* ------------------------------------------------------------------ */

const SPR_W: Record<Species, number> = { cow: 62, chicken: 30 }
const SPR_H: Record<Species, number> = { cow: 48, chicken: 30 }

const spriteCache = new Map<string, HTMLCanvasElement>()

function makeCanvas(w: number, h: number): CanvasRenderingContext2D {
  const cv = document.createElement('canvas')
  cv.width = w * 2 // x2 para nitidez al escalar
  cv.height = h * 2
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  g.scale(2, 2)
  return g
}

/** Devuelve (y cachea) el sprite pedido; ancla abajo-centro del canvas. */
export function getAnimalSprite(
  sp: Species,
  st: AnimalState,
  fr: number,
  variant = 0,
): HTMLCanvasElement {
  const key = sp + ':' + st + ':' + fr + ':' + variant
  let cv = spriteCache.get(key)
  if (!cv) {
    const w = SPR_W[sp]
    const h = SPR_H[sp]
    const g = makeCanvas(w, h)
    if (sp === 'cow') drawCowFrame(g, w, h, st, fr)
    else drawChickenFrame(g, w, h, st, fr)
    cv = g.canvas
    spriteCache.set(key, cv)
  }
  return cv
}

/* ------------------------------------------------------------------ */
/* VACA (vista lateral, mirando a la derecha)                          */
/* ------------------------------------------------------------------ */

function drawCowFrame(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  st: AnimalState,
  fr: number,
): void {
  const cx = w / 2
  const groundY = h - 3
  const walking = st === 'walk'
  const grazing = st === 'graze'

  // Ciclo de patas: pares diagonales alternos.
  const legPhase = walking ? [0, 1, 0, -1][fr % 4] : 0
  const legPhaseB = walking ? [0, -1, 0, 1][fr % 4] : 0
  const bob = walking && fr % 2 === 1 ? -1.2 : 0
  const bodyY = groundY - 17 + bob

  // Patas traseras (par lejano).
  g.lineCap = 'round'
  g.strokeStyle = '#d8d2c6'
  g.lineWidth = 4.4
  for (const lx of [-13, -8]) {
    g.beginPath()
    g.moveTo(cx + lx, bodyY + 6)
    g.lineTo(cx + lx + legPhaseB * 2.4, groundY - 1.4)
    g.stroke()
  }
  // Patas delanteras (par cercano).
  g.strokeStyle = '#efe9dd'
  for (const lx of [9, 14]) {
    g.beginPath()
    g.moveTo(cx + lx, bodyY + 6)
    g.lineTo(cx + lx + legPhase * 2.4, groundY - 1)
    g.stroke()
  }
  // Pezunas.
  g.strokeStyle = '#5b4a3a'
  g.lineWidth = 4.4
  for (const lx of [-13, -8]) {
    g.beginPath()
    g.moveTo(cx + lx + legPhaseB * 2.4, groundY - 3)
    g.lineTo(cx + lx + legPhaseB * 2.4, groundY - 1.4)
    g.stroke()
  }
  for (const lx of [9, 14]) {
    g.beginPath()
    g.moveTo(cx + lx + legPhase * 2.4, groundY - 2.6)
    g.lineTo(cx + lx + legPhase * 2.4, groundY - 1)
    g.stroke()
  }

  // Cola con mechon.
  const tailSway = Math.sin((fr / 4) * Math.PI) * 3
  g.strokeStyle = '#efe9dd'
  g.lineWidth = 2.2
  g.beginPath()
  g.moveTo(cx - 19, bodyY - 4)
  g.quadraticCurveTo(cx - 25, bodyY + 2, cx - 24 + tailSway, bodyY + 12)
  g.stroke()
  g.fillStyle = '#6b563f'
  g.beginPath()
  g.ellipse(cx - 24 + tailSway, bodyY + 13.5, 2.1, 2.8, 0.4, 0, Math.PI * 2)
  g.fill()

  // Cuerpo: forma de capsula blanca con manchas marrones.
  g.fillStyle = '#f7f3ea'
  g.beginPath()
  g.ellipse(cx - 1, bodyY, 20, 12.5, 0, 0, Math.PI * 2)
  g.fill()
  // Manchas deterministas.
  g.fillStyle = '#7a5c40'
  g.beginPath()
  g.ellipse(cx - 8, bodyY - 3, 6.5, 4.5, 0.3, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.ellipse(cx + 7, bodyY + 3.5, 5, 3.4, -0.25, 0, Math.PI * 2)
  g.fill()
  // Sombreado del vientre.
  g.fillStyle = 'rgba(120,100,80,0.18)'
  g.beginPath()
  g.ellipse(cx - 2, bodyY + 8, 16, 4.5, 0, 0, Math.PI * 2)
  g.fill()
  // Ubre.
  g.fillStyle = '#eab6ae'
  g.beginPath()
  g.ellipse(cx + 10, bodyY + 9.5, 4, 3, 0.2, 0, Math.PI * 2)
  g.fill()

  // Cabeza: baja a pastar cuando corresponde.
  const headDip = grazing ? [0, 5, 8][(fr % 3)] : 0
  const hx = cx + 17
  const hy = bodyY - 8 + headDip
  // Cuello.
  g.strokeStyle = '#f7f3ea'
  g.lineWidth = 11
  g.beginPath()
  g.moveTo(cx + 12, bodyY - 4)
  g.lineTo(hx - 3, hy + 3)
  g.stroke()
  // Morro.
  g.fillStyle = '#f7f3ea'
  g.beginPath()
  g.ellipse(hx, hy, 8.5, 7, 0.15, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#e8a79b'
  g.beginPath()
  g.ellipse(hx + 3.5, hy + 2.5, 5, 4.2, 0.15, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#8c605a'
  g.beginPath()
  g.ellipse(hx + 2.5, hy + 1.8, 1, 1.4, 0, 0, Math.PI * 2)
  g.ellipse(hx + 6, hy + 3.4, 1, 1.4, 0, 0, Math.PI * 2)
  g.fill()
  // Ojo.
  g.fillStyle = '#33261c'
  g.beginPath()
  g.arc(hx - 1.5, hy - 2, 1.35, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(hx - 1.9, hy - 2.4, 0.45, 0, Math.PI * 2)
  g.fill()
  // Oreja y cuerno.
  g.fillStyle = '#e8e2d6'
  g.beginPath()
  g.ellipse(hx - 7, hy - 5, 3.4, 2.2, -0.5, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#d9cfc0'
  g.beginPath()
  g.moveTo(hx - 3.5, hy - 6.5)
  g.quadraticCurveTo(hx - 2, hy - 10.5, hx + 1, hy - 9)
  g.quadraticCurveTo(hx - 1, hy - 7.5, hx - 3.5, hy - 6.5)
  g.fill()
}

/* ------------------------------------------------------------------ */
/* GALLINA                                                             */
/* ------------------------------------------------------------------ */

function drawChickenFrame(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  st: AnimalState,
  fr: number,
): void {
  const cx = w / 2
  const groundY = h - 2
  const walking = st === 'walk'
  const pecking = st === 'peck'

  // Patas alternadas al caminar.
  const legPhase = walking ? [0, 1, 0, -1][fr % 4] : 0
  g.strokeStyle = '#d99a3c'
  g.lineWidth = 1.4
  g.lineCap = 'round'
  for (const side of [-1, 1]) {
    const off = side * legPhase * 1.6
    const lift = walking && fr % 2 === (side < 0 ? 0 : 1) ? 1.6 : 0
    g.beginPath()
    g.moveTo(cx - 0.5, groundY - 6)
    g.lineTo(cx - 0.5 + off, groundY - 2.4 - lift)
    g.stroke()
    // Dedos.
    g.beginPath()
    g.moveTo(cx - 0.5 + off, groundY - 2.4 - lift)
    g.lineTo(cx - 2.4 + off, groundY - 1.4)
    g.moveTo(cx - 0.5 + off, groundY - 2.4 - lift)
    g.lineTo(cx + 1.4 + off, groundY - 1.4)
    g.stroke()
  }

  // Cola: plumitas en abanico.
  g.fillStyle = '#efe9dd'
  for (const a of [-0.55, -0.25, 0.05]) {
    g.save()
    g.translate(cx - 6.5, groundY - 12)
    g.rotate(a - 0.35)
    g.beginPath()
    g.ellipse(-3.4, -1.2, 4.4, 1.7, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }

  const bob = walking && fr % 2 === 1 ? -0.9 : 0
  const bodyY = groundY - 11.5 + bob

  // Cuerpo ovalado.
  g.fillStyle = '#f7f3ea'
  g.beginPath()
  g.ellipse(cx, bodyY, 7.2, 5.6, -0.15, 0, Math.PI * 2)
  g.fill()
  // Ala.
  g.fillStyle = '#e3dccd'
  g.beginPath()
  g.ellipse(cx - 1, bodyY + 0.8, 4.6, 3, -0.35, 0.35, Math.PI * 1.75)
  g.fill()

  // Cabeza: se agacha al picotear.
  const dip = pecking ? [2, 7, 10][fr % 3] : 0
  const hx = cx + 6
  const hy = bodyY - 6.5 + dip
  // Cuello corto.
  g.strokeStyle = '#f7f3ea'
  g.lineWidth = 5
  g.beginPath()
  g.moveTo(cx + 4, bodyY - 2)
  g.lineTo(hx, hy + 1.5)
  g.stroke()
  g.fillStyle = '#f7f3ea'
  g.beginPath()
  g.arc(hx, hy, 3.9, 0, Math.PI * 2)
  g.fill()
  // Cresta y barbilla.
  g.fillStyle = '#d94f43'
  g.beginPath()
  g.ellipse(hx - 0.6, hy - 4, 1.1, 1.7, 0, 0, Math.PI * 2)
  g.ellipse(hx + 1.2, hy - 3.7, 1.1, 1.5, 0, 0, Math.PI * 2)
  g.fill()
  if (!pecking || dip < 6) {
    g.beginPath()
    g.ellipse(hx + 3, hy + 2.5, 1.2, 1.7, 0.3, 0, Math.PI * 2)
    g.fill()
  }
  // Pico.
  g.fillStyle = '#e8a13c'
  g.beginPath()
  g.moveTo(hx + 3, hy - 0.8)
  g.lineTo(hx + 6.8, hy + 0.4 + dip * 0.22)
  g.lineTo(hx + 3, hy + 1.4)
  g.closePath()
  g.fill()
  // Ojo.
  g.fillStyle = '#33261c'
  g.beginPath()
  g.arc(hx + 1.2, hy - 0.8, 0.95, 0, Math.PI * 2)
  g.fill()
}

/* ------------------------------------------------------------------ */
/* Capa ambiente: animales decorativos con rutas deterministas          */
/* ------------------------------------------------------------------ */

interface AmbientAnimal {
  view: AnimalView
  homeX: number
  homeY: number
  radius: number
  speed: number
  step: number // contador de waypoints (determinista)
  targetX: number
  targetY: number
  waitT: number
  animT: number
}

function framesOf(st: AnimalState): number {
  return st === 'walk' ? 4 : 3
}

const CHICKEN_SPEED = 0.55

export class AnimalLayer {
  private animals: AmbientAnimal[] = []

  constructor() {
    // Gallinas en el patio del granero.
    const barnPad = PADS.barn
    const spots: Array<[number, number]> = [
      [barnPad.x1 + 2.4, barnPad.y0 + 3.2],
      [barnPad.x1 + 3.6, barnPad.y0 + 5.4],
      [barnPad.x1 + 2.0, barnPad.y0 + 6.6],
    ]
    spots.forEach(([sx, sy], idx) => {
      this.animals.push({
        view: { id: 'amb-ch' + idx, species: 'chicken', x: sx, y: sy, facing: 1, state: 'idle' },
        homeX: sx,
        homeY: sy,
        radius: 1.6,
        speed: CHICKEN_SPEED,
        step: idx * 7 + 3,
        targetX: sx,
        targetY: sy,
        waitT: 1 + idx,
        animT: idx * 0.37,
      })
    })
  }

  /** Avanza la simulación decorativa (dt en segundos). */
  update(dt: number): void {
    if (!(dt > 0)) return
    for (const a of this.animals) {
      a.animT += dt

      if (a.view.state === 'walk') {
        const dx = a.targetX - a.view.x
        const dy = a.targetY - a.view.y
        const dist = Math.hypot(dx, dy)
        if (dist <= Math.max(0.06, a.speed * dt)) {
          a.view.x = a.targetX
          a.view.y = a.targetY
          a.step++
          // Descanso: la vaca pasta, las gallinas picotean o miran.
          a.waitT = 2 + unit(a.step, Math.round(a.homeX * 10), 77) * 4
          a.view.state =
            a.view.species === 'cow'
              ? 'graze'
              : unit(a.step, 5, 78) > 0.45
                ? 'peck'
                : 'idle'
        } else {
          a.view.x += (dx / dist) * a.speed * dt
          a.view.y += (dy / dist) * a.speed * dt
          if (Math.abs(dx) > 0.02) a.view.facing = dx > 0 ? 1 : -1
        }
      } else {
        a.waitT -= dt
        if (a.waitT <= 0) {
          // Nuevo waypoint determinista alrededor del hogar.
          const ang = unit(a.step, 11, 79) * Math.PI * 2
          const rad = (0.35 + unit(a.step, 13, 80) * 0.65) * a.radius
          a.targetX = a.homeX + Math.cos(ang) * rad
          a.targetY = a.homeY + Math.sin(ang) * rad * 0.7
          a.view.state = 'walk'
        }
      }
    }
  }

  /** Vistas actuales (para intercalar en el depth-sort del composer). */
  allViews(): AnimalView[] {
    return this.animals.map((a) => a.view)
  }

  /** Vista por id (para pintar el highlight de selección). */
  viewById(id: string): AnimalView | null {
    return this.animals.find((a) => a.view.id === id)?.view ?? null
  }

  /**
   * Hit-test generoso (targets táctiles): radio por especie en unidades de
   * mundo alrededor de la BASE del animal. Devuelve la vista más cercana.
   */
  hit(wx: number, wy: number): AnimalView | null {
    let best: AnimalView | null = null
    let bestD = Infinity
    for (const a of this.animals) {
      const r = a.view.species === 'cow' ? 0.9 : 0.55
      const d = Math.hypot(a.view.x - wx, (a.view.y - wy) * 1.6)
      if (d <= r && d < bestD) {
        best = a.view
        bestD = d
      }
    }
    return best
  }

  /** Dibuja todos los animales ordenados por profundidad (y de mundo). */
  draw(c: PaintCtx, nowMs: number): void {
    const sorted = [...this.animals].sort((p, q) => p.view.y - q.view.y)
    for (const a of sorted) this.drawView(c, a.view, nowMs)
  }

  /**
   * SEAM futuro: dibuja vistas provistas por el store real del juego
   * (mismo pipeline de sprites cacheados).
   */
  drawViews(c: PaintCtx, views: readonly AnimalView[], nowMs: number): void {
    const sorted = [...views].sort((p, q) => p.y - q.y)
    for (const v of sorted) this.drawView(c, v, nowMs)
  }

  drawView(c: PaintCtx, v: AnimalView, nowMs: number): void {
    const g = c.g
    const scr = c.at(v.x, v.y)
    const z = c.z
    const isCow = v.species === 'cow'
    const sw = (isCow ? SPR_W.cow : SPR_W.chicken) * z * (isCow ? 1 : 0.95)
    const sh = (isCow ? SPR_H.cow : SPR_H.chicken) * z * (isCow ? 1 : 0.95)

    // Sombra suave bajo los pies.
    g.save()
    g.fillStyle = 'rgba(20,52,74,0.18)'
    g.beginPath()
    g.ellipse(scr.x + 2 * z, scr.y + 0.5 * z, sw * 0.36, sh * 0.09, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()

    const total = FRAME_MS[v.state] * framesOf(v.state)
    const t = ((nowMs % total) + total) % total
    const fr = Math.floor(t / FRAME_MS[v.state])

    const spr = getAnimalSprite(v.species, v.state, fr)
    g.save()
    if (v.facing === -1) {
      g.translate(scr.x, scr.y)
      g.scale(-1, 1)
      g.drawImage(spr, -sw / 2, -sh, sw, sh)
    } else {
      g.drawImage(spr, scr.x - sw / 2, scr.y - sh, sw, sh)
    }
    g.restore()
  }
}
