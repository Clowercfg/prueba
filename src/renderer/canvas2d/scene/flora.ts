/**
 * Flora: árboles, pinos, arbustos, juncos y rocas.
 *
 * Los árboles del bosque se GENERAN sobre las tiles FOREST con ruido de
 * agrupamiento (clumps) → grupos naturales irregulares en los bordes del
 * mapa, no filas ni círculos perfectos. Las variantes (tamaño, tono,
 * inclinación, forma) vienen de hashes deterministas.
 */
import { TerrainType } from '../../../game/types'
import type { TileSystem } from '../../../game/systems/TileSystem'
import type { FarmEntity } from '../../../game/entities/farmEntities'
import { BAND_CONFIG } from '../../../game/config/layoutConfig'
import { PAL, shade, withAlpha } from './palette'
import { unit } from './rng'
import { shadowEllipse, type PaintCtx, type Vec2S } from './shapes'

export type DecorKind = 'oak' | 'pine' | 'bush' | 'cattail' | 'rock' | 'log' | 'twig' | 'leaves' | 'stone' | 'shoreStone'

export interface DecorItem {
  readonly kind: DecorKind
  readonly x: number
  readonly y: number
  /** Multiplicador de tamaño (1 ≈ árbol maduro). */
  readonly s: number
  readonly seed: number
  readonly depth: number
}

/** Sombra elíptica en pantalla para objetos apoyados en `base`. */
function groundShadow(g: CanvasRenderingContext2D, base: Vec2S, rxPx: number, alpha: number): void {
  shadowEllipse(g, base.x + rxPx * 0.2, base.y + rxPx * 0.1, rxPx, rxPx * 0.48, alpha)
}

/**
 * Genera decoración determinista a partir del mapa:
 *  - FOREST → robles/pinos/arbustos agrupados por ruido (claros naturales).
 *  - ROCK   → afloramientos rocosos.
 *  - SAND junto a WATER → juncos en la orilla del estanque.
 */
export function generateForestDecor(tiles: TileSystem): DecorItem[] {
  const items: DecorItem[] = []
  // Topes duros por especie de detalle: calidad antes que cantidad.
  const caps: Record<string, number> = {
    log: 3,
    twig: 8,
    leaves: 14,
    stone: 5,
    shoreStone: 6,
  }
  const touchesWater = (i: number, j: number): boolean => {
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (tiles.getType(i + di, j + dj) === TerrainType.WATER) return true
      }
    }
    return false
  }

  for (let j = 0; j < tiles.height; j++) {
    for (let i = 0; i < tiles.width; i++) {
      const t = tiles.getTile(i, j)
      if (!t || t.type === TerrainType.VOID || t.type === TerrainType.WATER) continue

      // Ruido de clump: concentra la vegetación en manchas irregulares.
      const clump = unit(Math.floor(i / 2.2), Math.floor(j / 2.2), 401)
      const r = unit(i + 0.5, j + 0.5, 402)

      if (t.type === TerrainType.FOREST) {
        const density = clump < 0.42 ? 0.85 : clump > 0.78 ? 0.18 : 0.5
        if (r < density * 0.72) {
          const kind: DecorKind = r < density * 0.2 ? 'pine' : 'oak'
          items.push({
            kind,
            x: i + 0.5 + (unit(i, j, 403) - 0.5) * 0.62,
            y: j + 0.5 + (unit(j, i, 404) - 0.5) * 0.62,
            s: 0.78 + unit(i, j, 405) * 0.5,
            seed: unit(i, j, 406),
            depth: j + 1.05,
          })
        } else if (r < density * 0.72 + 0.14) {
          items.push({
            kind: 'bush',
            x: i + 0.5 + (unit(i, j, 407) - 0.5) * 0.6,
            y: j + 0.5 + (unit(j, i, 408) - 0.5) * 0.6,
            s: 0.8 + unit(i, j, 409) * 0.45,
            seed: unit(i, j, 410),
            depth: j + 1.04,
          })
        }
      } else if (t.type === TerrainType.ROCK) {
        items.push({
          kind: 'rock',
          x: i + 0.5 + (unit(i, j, 411) - 0.5) * 0.4,
          y: j + 0.5 + (unit(j, i, 412) - 0.5) * 0.4,
          s: 0.9 + unit(i, j, 413) * 0.4,
          seed: unit(i, j, 414),
          depth: j + 1.03,
        })
      } else if (t.type === TerrainType.SAND && touchesWater(i, j) && r < 0.34 && clump > 0.35) {
        items.push({
          kind: 'cattail',
          x: i + 0.5 + (unit(i, j, 415) - 0.5) * 0.5,
          y: j + 0.5 + (unit(j, i, 416) - 0.5) * 0.5,
          s: 0.85 + unit(i, j, 417) * 0.4,
          seed: unit(i, j, 418),
          depth: j + 1.02,
        })
      }

      // ---- Detalles menores con tope (troncos, ramas, hojas, piedras).
      if (caps.log > 0 && t.type === TerrainType.FOREST && clump > 0.52 && r > 0.7 && r < 0.73) {
        caps.log--
        items.push(mk('log', i, j, 431, 1.0))
      } else if (caps.twig > 0 && t.type === TerrainType.FOREST && r > 0.55 && r < 0.585 && clump < 0.55) {
        caps.twig--
        items.push(mk('twig', i, j, 432, 0.9))
      } else if (
        caps.leaves > 0 &&
        (t.type === TerrainType.GRASS || t.type === TerrainType.FOREST) &&
        unit(i, j, 433) < 0.05 &&
        fbmLite(i, j)
      ) {
        caps.leaves--
        items.push(mk('leaves', i, j, 434, 0.9))
      } else if (caps.stone > 0 && t.type === TerrainType.GRASS && unit(i, j, 461) < 0.028) {
        caps.stone--
        items.push(mk('stone', i, j, 462, 0.9))
      } else if (
        caps.shoreStone > 0 &&
        t.type === TerrainType.SAND &&
        touchesWater(i, j) &&
        unit(i, j, 463) < 0.2
      ) {
        caps.shoreStone--
        items.push(mk('shoreStone', i, j, 464, 1.0))
      }
    }
  }
  return items
}

/** Ruido barato de dos octavas para filtrar hojarasca lejos de zonas verdes. */
function fbmLite(i: number, j: number): boolean {
  return unit(Math.floor(i / 2), Math.floor(j / 2), 441) > 0.25
}

function mk(kind: DecorKind, i: number, j: number, salt: number, baseScale: number): DecorItem {
  return {
    kind,
    x: i + 0.5 + (unit(i, j, salt) - 0.5) * 0.6,
    y: j + 0.5 + (unit(j, i, salt + 50) - 0.5) * 0.6,
    s: baseScale * (0.85 + unit(i, j, salt + 100) * 0.35),
    seed: unit(i, j, salt + 150),
    depth: j + 1.01,
  }
}

/** Dibuja un item de decoración generado. */
export function drawDecor(c: PaintCtx, it: DecorItem): void {
  const base = c.at(it.x, it.y)
  switch (it.kind) {
    case 'oak':
      drawOak(c, base, 76 * it.s, it.seed)
      break
    case 'pine':
      drawPine(c, base, 80 * it.s, it.seed)
      break
    case 'bush':
      drawBush(c, base, 46 * it.s, it.seed)
      break
    case 'cattail':
      drawCattail(c, base, 34 * it.s, it.seed)
      break
    case 'rock':
      drawRockCluster(c, base, 30 * it.s, it.seed)
      break
    case 'log':
      drawLog(c, base, 46 * it.s, it.seed)
      break
    case 'twig':
      drawTwig(c, base, 16 * it.s, it.seed)
      break
    case 'leaves':
      drawLeafLitter(c, base, 14 * it.s, it.seed)
      break
    case 'stone':
      drawStone(c, base, 13 * it.s, it.seed)
      break
    case 'shoreStone':
      drawShoreStone(c, base, 12 * it.s, it.seed)
      break
  }
}

/**
 * Entidad vegetación/tree.png del mundo estático: escala .115/.104/.093 =
 * árbol maduro; .062 = arbusto. La variante oak/pine sale del seed posicional.
 */
export function drawTreeEntity(c: PaintCtx, e: FarmEntity): void {
  // Árboles del mapa ~32% más chicos que el original (ajuste visual Mini App).
  const heightPx = e.scale * 680
  const seed = unit(Math.round(e.x * 10), Math.round(e.y * 10), 501)
  const base = c.at(e.x, e.y)
  if (e.scale < 0.08) {
    drawBush(c, base, heightPx * 0.55, seed)
  } else if (seed < 0.28) {
    drawPine(c, base, heightPx * 1.04, seed)
  } else {
    drawOak(c, base, heightPx, seed)
  }
}

/* ------------------------------------------------------------------ */
/* Pintores                                                            */
/* ------------------------------------------------------------------ */

/** Copa de círculos superpuestos con luz arriba-izquierda y borde inferior oscuro. */
function canopyBlob(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  seed: number,
): void {
  const lobes: Array<{ dx: number; dy: number; r: number }> = [{ dx: 0, dy: 0, r: R }]
  const n = 5 + Math.floor(seed * 2.99)
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed * 6.2
    const dist = R * (0.52 + unit(k, Math.floor(seed * 97), 601) * 0.22)
    lobes.push({
      dx: Math.cos(a) * dist,
      dy: Math.sin(a) * dist * 0.86,
      r: R * (0.42 + unit(k, 7, 602) * 0.2),
    })
  }

  // 1) Masa sombreada desplazada abajo-derecha.
  g.fillStyle = PAL.flora.oakShade
  g.beginPath()
  for (const l of lobes) {
    g.moveTo(cx + l.dx + l.r, cy + l.dy)
    g.arc(cx + l.dx + R * 0.06, cy + l.dy + R * 0.09, l.r * 0.92, 0, Math.PI * 2)
  }
  g.fill()

  // 2) Masa media.
  g.fillStyle = PAL.flora.oakMid
  g.beginPath()
  for (const l of lobes) {
    g.moveTo(cx + l.dx + l.r, cy + l.dy)
    g.arc(cx + l.dx, cy + l.dy, l.r * 0.94, 0, Math.PI * 2)
  }
  g.fill()

  // 3) Zona iluminada arriba-izquierda.
  g.fillStyle = PAL.flora.oakLit
  g.beginPath()
  for (let k = 0; k < lobes.length; k++) {
    const l = lobes[k]
    const lx = cx + l.dx - R * 0.22 + (unit(k, 11, 603) - 0.5) * R * 0.24
    const ly = cy + l.dy - R * 0.26 + (unit(k, 13, 604) - 0.5) * R * 0.24
    g.moveTo(lx + l.r * 0.62, ly)
    g.arc(lx, ly, l.r * 0.62, 0, Math.PI * 2)
  }
  g.fill()

  // Destellos.
  g.fillStyle = PAL.flora.oakSpark
  for (let k = 0; k < 4; k++) {
    const a = seed * 6.28 + k * 1.7
    g.beginPath()
    g.arc(
      cx + Math.cos(a) * R * 0.55 - R * 0.15,
      cy + Math.sin(a) * R * 0.4 - R * 0.3,
      R * 0.09,
      0,
      Math.PI * 2,
    )
    g.fill()
  }
}

function trunkShape(
  g: CanvasRenderingContext2D,
  base: Vec2S,
  h: number,
  w: number,
  lean: number,
): void {
  const topX = base.x + lean * h
  g.beginPath()
  g.moveTo(base.x - w, base.y + 1)
  g.quadraticCurveTo(base.x - w * 0.55, base.y - h * 0.55, topX - w * 0.32, base.y - h)
  g.lineTo(topX + w * 0.38, base.y - h)
  g.quadraticCurveTo(base.x + w * 0.75, base.y - h * 0.5, base.x + w * 1.25, base.y + 1)
  g.closePath()
  g.fillStyle = PAL.flora.trunkLit
  g.fill()
  // Cara en sombra (lado derecho).
  g.beginPath()
  g.moveTo(topX + w * 0.05, base.y - h)
  g.quadraticCurveTo(base.x + w * 0.7, base.y - h * 0.5, base.x + w * 1.25, base.y + 1)
  g.lineTo(base.x + w * 0.45, base.y + 1)
  g.quadraticCurveTo(base.x + w * 0.35, base.y - h * 0.55, topX + w * 0.05, base.y - h)
  g.closePath()
  g.fillStyle = PAL.flora.trunkShade
  g.fill()
  // Raíces.
  g.fillStyle = PAL.flora.trunkShade
  for (const dir of [-1, 1]) {
    g.beginPath()
    g.ellipse(base.x + dir * w * 1.15, base.y - 1, w * 0.7, w * 0.32, 0, 0, Math.PI * 2)
    g.fill()
  }
}

export function drawOak(c: PaintCtx, base: Vec2S, H: number, seed: number): void {
  const g = c.g
  groundShadow(g, base, H * 0.42, 0.2)

  const lean = (seed - 0.5) * 0.24
  const trunkH = H * 0.4
  const trunkW = Math.max(2.2, H * 0.052)
  trunkShape(g, base, trunkH, trunkW, lean)

  const ccx = base.x + lean * trunkH - H * 0.02
  const ccy = base.y - trunkH - H * 0.26
  canopyBlob(g, ccx, ccy, H * 0.33, seed)

  // Oclusión bajo la copa.
  g.strokeStyle = withAlpha(PAL.flora.trunkShade, 0.45)
  g.lineWidth = Math.max(1.5, H * 0.03)
  g.beginPath()
  g.moveTo(ccx - H * 0.1, ccy + H * 0.3)
  g.quadraticCurveTo(ccx, ccy + H * 0.38, ccx + H * 0.1, ccy + H * 0.3)
  g.stroke()
}

export function drawPine(c: PaintCtx, base: Vec2S, H: number, seed: number): void {
  const g = c.g
  groundShadow(g, base, H * 0.3, 0.18)

  const lean = (seed - 0.5) * 0.14
  const trunkH = H * 0.16
  trunkShape(g, base, trunkH, Math.max(2, H * 0.04), lean)

  const tiers = 3
  const tipX = base.x + lean * H
  const tipY = base.y - H
  let tierW = H * 0.36
  let tierBaseY = base.y - trunkH

  for (let t = 0; t < tiers; t++) {
    const tierTipY = tipY + (tierBaseY - tipY) * (t === tiers - 1 ? 1 : 0.12)
    // Triángulo base (tono medio).
    g.beginPath()
    g.moveTo(tipX, tierTipY)
    g.lineTo(base.x + tierW, tierBaseY)
    g.lineTo(base.x - tierW, tierBaseY)
    g.closePath()
    g.fillStyle = PAL.flora.pineMid
    g.fill()
    // Mitad derecha en sombra.
    g.beginPath()
    g.moveTo(tipX, tierTipY)
    g.lineTo(base.x + tierW, tierBaseY)
    g.lineTo(base.x + tierW * 0.08, tierBaseY)
    g.closePath()
    g.fillStyle = PAL.flora.pineShade
    g.fill()
    // Filo iluminado a la izquierda.
    g.beginPath()
    g.moveTo(tipX, tierTipY)
    g.lineTo(base.x - tierW * 0.52, tierBaseY - stepBulge(H))
    g.lineTo(base.x - tierW * 0.06, tierBaseY)
    g.closePath()
    g.fillStyle = PAL.flora.pineLit
    g.fill()
    tierW *= 0.72
    tierBaseY -= H * 0.24
  }
}

function stepBulge(H: number): number {
  return H * 0.02
}

export function drawBush(c: PaintCtx, base: Vec2S, H: number, seed: number): void {
  const g = c.g
  groundShadow(g, base, H * 0.66, 0.18)
  const R = H * 0.52
  const blobs = [
    { dx: -R * 0.55, dy: -R * 0.35, r: R * 0.72 },
    { dx: R * 0.5, dy: -R * 0.3, r: R * 0.66 },
    { dx: 0, dy: -R * 0.75, r: R * 0.78 },
  ]
  g.fillStyle = PAL.flora.oakShade
  g.beginPath()
  for (const b of blobs) {
    g.moveTo(base.x + b.dx + b.r, base.y + b.dy)
    g.arc(base.x + b.dx + R * 0.07, base.y + b.dy + R * 0.1, b.r * 0.92, 0, Math.PI * 2)
  }
  g.fill()
  g.fillStyle = PAL.flora.oakMid
  g.beginPath()
  for (const b of blobs) {
    g.moveTo(base.x + b.dx + b.r, base.y + b.dy)
    g.arc(base.x + b.dx, base.y + b.dy, b.r, 0, Math.PI * 2)
  }
  g.fill()
  g.fillStyle = PAL.flora.oakLit
  g.beginPath()
  for (const b of blobs) {
    g.moveTo(base.x + b.dx - b.r * 0.5, base.y + b.dy - b.r * 0.4)
    g.arc(base.x + b.dx - R * 0.18, base.y + b.dy - R * 0.22, b.r * 0.55, 0, Math.PI * 2)
  }
  g.fill()
  if (seed > 0.45) {
    g.fillStyle = PAL.flora.bushBerries
    for (let k = 0; k < 5; k++) {
      const a = k * 1.9 + seed * 5
      g.beginPath()
      g.arc(
        base.x + Math.cos(a) * R * 0.6,
        base.y - R * 0.5 + Math.sin(a) * R * 0.42,
        Math.max(1.1, R * 0.11),
        0,
        Math.PI * 2,
      )
      g.fill()
    }
  }
}

export function drawCattail(c: PaintCtx, base: Vec2S, H: number, seed: number): void {
  const g = c.g
  groundShadow(g, base, H * 0.34, 0.15)
  const stems = 3 + Math.floor(seed * 1.99)
  for (let k = 0; k < stems; k++) {
    const a = unit(k, Math.floor(seed * 31), 701) * 0.9 - 0.45
    const h = H * (0.75 + unit(k, 3, 702) * 0.5)
    const bend = a * h * 0.5
    const tipX = base.x + bend + (k - stems / 2) * 2.2 * c.z
    const tipY = base.y - h
    const hasHead = unit(k, 5, 703) < 0.6
    g.strokeStyle = PAL.water.reedStem
    g.lineWidth = Math.max(1, 1.4 * c.z)
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(base.x, base.y)
    g.quadraticCurveTo(base.x + bend * 0.3, base.y - h * 0.6, tipX, tipY)
    g.stroke()
    if (hasHead) {
      g.save()
      g.translate(tipX, tipY)
      const ang = Math.atan2(-h * 0.6, bend * 0.7) + Math.PI / 2
      g.rotate(ang)
      g.fillStyle = PAL.water.reedHead
      const hw = Math.max(1.4, 1.8 * c.z)
      const hh = h * 0.17
      g.beginPath()
      if (typeof g.roundRect === 'function') {
        g.roundRect(-hw / 2, -hh, hw, hh, hw / 2)
      } else {
        g.rect(-hw / 2, -hh, hw, hh)
      }
      g.fill()
      g.restore()
    }
  }
}

export function drawRockCluster(c: PaintCtx, base: Vec2S, S: number, seed: number): void {
  const g = c.g
  groundShadow(g, base, S * 0.8, 0.2)
  const rocks = [
    { dx: -S * 0.3, dy: 0, r: S * 0.42 },
    { dx: S * 0.36, dy: S * 0.06, r: S * 0.3 },
    { dx: S * 0.02, dy: -S * 0.22, r: S * 0.36 },
  ]
  rocks.forEach((rk, idx) => {
    const litIdx = unit(idx, Math.floor(seed * 53), 801) > 0.5
    const litCol = litIdx ? PAL.flora.rockLit : shade(PAL.flora.rockLit, -0.06)
    const shadeCol = litIdx ? PAL.flora.rockShade : shade(PAL.flora.rockShade, -0.08)
    const cxp = base.x + rk.dx
    const cyp = base.y - rk.r * 0.72 + rk.dy
    g.beginPath()
    g.ellipse(cxp, cyp, rk.r, rk.r * 0.78, 0, 0, Math.PI * 2)
    g.fillStyle = shadeCol
    g.fill()
    // Faceta iluminada arriba-izquierda.
    g.beginPath()
    g.ellipse(
      cxp - rk.r * 0.15,
      cyp - rk.r * 0.18,
      rk.r * 0.74,
      rk.r * 0.52,
      -0.4,
      Math.PI * 0.85,
      Math.PI * 1.95,
    )
    g.lineTo(cxp, cyp)
    g.closePath()
    g.fillStyle = litCol
    g.fill()
    // Musgo.
    if (idx === 0 || seed > 0.6) {
      g.fillStyle = withAlpha(PAL.flora.rockMoss, 0.8)
      g.beginPath()
      g.ellipse(cxp - rk.r * 0.2, cyp - rk.r * 0.42, rk.r * 0.5, rk.r * 0.24, -0.3, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/** Tronco caído: cilindro tumbado con anillos, musgo y un muñón de rama. */
export function drawLog(c: PaintCtx, base: Vec2S, L: number, seed: number): void {
  const g = c.g
  const ang = (seed - 0.5) * 0.5 // orientación casi alineada al eje iso-x
  groundShadow(g, { x: base.x + L * 0.05, y: base.y }, L * 0.52, 0.18)

  g.save()
  g.translate(base.x, base.y - L * 0.09)
  g.rotate(ang)

  const r = L * 0.13
  const half = L / 2 - r
  // Cuerpo: cara superior iluminada y lateral en sombra.
  g.fillStyle = PAL.flora.trunkShade
  roundedBar(g, -half, -r * 0.4, half * 2 + r * 2, r * 1.3, r * 0.65)
  g.fillStyle = PAL.flora.trunkLit
  roundedBar(g, -half, -r * 1.15, half * 2 + r * 2, r * 1.25, r * 0.62)
  // Vetas.
  g.strokeStyle = withAlpha('#3c2718', 0.35)
  g.lineWidth = Math.max(0.8, r * 0.09)
  for (let k = -1; k <= 1; k++) {
    g.beginPath()
    g.moveTo(-half * 0.8, k * r * 0.34)
    g.lineTo(half * 0.8, k * r * 0.34 + r * 0.08)
    g.stroke()
  }
  // Extremo cortado (elipse con anillo).
  g.fillStyle = shade(PAL.flora.trunkLit, 0.32)
  g.beginPath()
  g.ellipse(half + r * 0.9, -r * 0.45, r * 0.55, r * 0.95, 0, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = shade(PAL.flora.trunkLit, -0.25)
  g.lineWidth = Math.max(0.7, r * 0.1)
  g.beginPath()
  g.ellipse(half + r * 0.9, -r * 0.45, r * 0.3, r * 0.55, 0, 0, Math.PI * 2)
  g.stroke()
  // Muñón de rama rota.
  if (seed > 0.4) {
    g.save()
    g.translate(-half * 0.35, -r * 1.05)
    g.rotate(-0.7)
    g.fillStyle = PAL.flora.trunkShade
    roundedBar(g, 0, 0, r * 1.1, r * 0.42, r * 0.2)
    g.restore()
  }
  // Musgo encima.
  g.fillStyle = withAlpha(PAL.flora.rockMoss, 0.75)
  g.beginPath()
  g.ellipse(-half * 0.2, -r * 1.12, half * 0.5, r * 0.3, 0, 0, Math.PI * 2)
  g.fill()

  g.restore()
}

function roundedBar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
): void {
  g.beginPath()
  if (typeof g.roundRect === 'function') {
    g.roundRect(x, y, w, h, rad)
  } else {
    g.rect(x, y, w, h)
  }
  g.fill()
}

/** Rama pequeña caída con horquilla. */
export function drawTwig(c: PaintCtx, base: Vec2S, S: number, seed: number): void {
  const g = c.g
  const a = seed * Math.PI
  shadowEllipse(g, base.x + 1.6 * c.z, base.y + 0.8 * c.z, S * 0.42, S * 0.14, 0.1)
  g.strokeStyle = '#7a5230'
  g.lineWidth = Math.max(1, 1.5 * c.z)
  g.lineCap = 'round'
  const dx = Math.cos(a) * S
  const dy = Math.sin(a) * S * 0.45
  g.beginPath()
  g.moveTo(base.x - dx / 2, base.y - dy / 2)
  g.lineTo(base.x + dx / 2, base.y + dy / 2)
  // Horquilla.
  g.moveTo(base.x + dx * 0.1, base.y + dy * 0.1)
  g.lineTo(base.x + dx * 0.28, base.y + dy * 0.28 - S * 0.3)
  g.stroke()
}

/** Hojas caídas: 3-5 hojitas en dos verdes y un toque otoñal. */
export function drawLeafLitter(c: PaintCtx, base: Vec2S, S: number, seed: number): void {
  const g = c.g
  const n = 3 + Math.floor(seed * 2.99)
  const cols = [PAL.flora.oakMid, PAL.flora.oakShade, '#d9a24a']
  for (let k = 0; k < n; k++) {
    const a = unit(k, 91, 851) * Math.PI * 2
    const dist = unit(k, 92, 852) * S * 0.55
    const lx = base.x + Math.cos(a) * dist
    const ly = base.y + Math.sin(a) * dist * 0.5
    g.save()
    g.translate(lx, ly)
    g.rotate(a + 1.2)
    g.fillStyle = cols[k % cols.length]
    g.beginPath()
    g.ellipse(0, 0, 2.6 * c.z, 1.2 * c.z, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
}

/** Piedra mediana sobre el prado. */
export function drawStone(c: PaintCtx, base: Vec2S, S: number, seed: number): void {
  const g = c.g
  shadowEllipse(g, base.x + 1.6 * c.z, base.y + 1 * c.z, S * 0.62, S * 0.26, 0.16)
  const cy = base.y - S * 0.3
  g.fillStyle = PAL.flora.rockShade
  g.beginPath()
  g.ellipse(base.x, cy, S * 0.48, S * 0.36, seed * 0.6, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = PAL.flora.rockLit
  g.beginPath()
  g.ellipse(base.x - S * 0.1, cy - S * 0.1, S * 0.36, S * 0.24, seed * 0.6, 0, Math.PI * 2)
  g.fill()
  if (seed > 0.55) {
    g.fillStyle = withAlpha(PAL.flora.rockMoss, 0.7)
    g.beginPath()
    g.ellipse(base.x - S * 0.12, cy - S * 0.22, S * 0.22, S * 0.1, -0.3, 0, Math.PI * 2)
    g.fill()
  }
}

/** Piedra medio hundida en la orilla: base mojada oscura. */
export function drawShoreStone(c: PaintCtx, base: Vec2S, S: number, seed: number): void {
  const g = c.g
  shadowFlatLocal(g, base.x + 1.8 * c.z, base.y + 1.2 * c.z, S * 0.66, S * 0.3, 0.16)
  const cy = base.y - S * 0.24
  g.fillStyle = shade(PAL.flora.rockShade, -0.12)
  g.beginPath()
  g.ellipse(base.x, cy, S * 0.44, S * 0.32, seed, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = PAL.flora.rockLit
  g.beginPath()
  g.ellipse(base.x - S * 0.08, cy - S * 0.12, S * 0.32, S * 0.2, seed, 0, Math.PI * 2)
  g.fill()
  // Reflejo del agua lamendo la base.
  g.strokeStyle = withAlpha('#bfe8f2', 0.5)
  g.lineWidth = 1 * c.z
  g.beginPath()
  g.ellipse(base.x, base.y + S * 0.06, S * 0.5, S * 0.14, 0, 0.15, Math.PI - 0.15)
  g.stroke()
}

function shadowFlatLocal(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  alpha: number,
): void {
  g.save()
  g.translate(cx, cy)
  g.scale(1, sy / sx)
  g.fillStyle = `rgba(20,52,74,${alpha})`
  g.beginPath()
  g.arc(0, 0, sx, 0, Math.PI * 2)
  g.fill()
  g.restore()
}

/**
 * Anillo de vegetación que funde el borde del terreno jugable con la
 * pradera continua (#25): setos y árboles dispersos JUSTO fuera del rombo
 * de la banda, en tres hileras de densidad decreciente. Determinista;
 * se hornea en la banda de tierra (bajo objetos, fuera del área de juego).
 */
export function drawMeadowRing(c: PaintCtx, art?: HTMLImageElement | null): void {
  const { halfU, vMin, vMax } = BAND_CONFIG
  const uEdge = halfU + 1

  // Árbol/seto real: imagen anclada al punto de contacto con el suelo.
  const blitArt = (base: Vec2S, H: number): boolean => {
    if (!art || art.naturalWidth === 0 || art.naturalHeight === 0) return false
    const w = H * (art.naturalWidth / art.naturalHeight)
    c.g.drawImage(art, base.x - w / 2, base.y - H, w, H)
    return true
  }

  const cluster = (wx: number, wy: number, row: number, seed: number): void => {
    const r = unit(wx * 7.3, wy * 5.1, 700 + (seed % 97))
    const base = c.at(wx, wy)
    // Árbol pequeño ocasional en la hilera interior → línea de bosque.
    if (row === 0 && r < 0.15) {
      const h = 60 + unit(wy, wx, 701) * 34
      if (blitArt(base, h)) return
      if (r < 0.06) drawPine(c, base, h, seed % 8 === 0 ? 1 : 2)
      else drawOak(c, base, h, seed % 5)
      return
    }
    const hb = 22 + unit(wx, wy, 702) * 14
    if (blitArt(base, hb)) return
    drawBush(c, base, hb, seed % 6)
  }

  // Densidad por hilera: interior continua, exteriores raleadas.
  const skipFor = (row: number, a: number, b: number): boolean =>
    row === 1 ? unit(a, b, 712) < 0.32 : row === 2 ? unit(a, b, 713) < 0.52 : false

  // Laterales del rombo (u = ±d) recorriendo v; tapas (v fija) recorriendo u.
  for (let row = 0; row < 3; row++) {
    const d = uEdge + 0.55 + row * 0.95
    for (let v = vMin - 1.5; v <= vMax + 3; v += 0.9) {
      for (const su of [-1, 1] as const) {
        const u = su * d + (unit(v, su * (row + 4), 710) - 0.5) * 0.7
        const vv = v + (unit(su * (row + 4), v, 711) - 0.5) * 0.7
        if (skipFor(row, u, vv)) continue
        cluster((u + vv) / 2, (vv - u) / 2, row, Math.abs(Math.round(u * 13 + vv)))
      }
    }
    for (const sv of [-1, 1] as const) {
      const vc = sv < 0 ? vMin - 0.6 - row * 0.9 : vMax + 2.6 + row * 0.9
      for (let u = -uEdge - 0.5; u <= uEdge + 0.5; u += 0.85) {
        const uu = u + (unit(u, vc, 714) - 0.5) * 0.7
        const vvv = vc + (unit(vc, u, 715) - 0.5) * 0.7
        if (skipFor(row, uu, vvv)) continue
        cluster((uu + vvv) / 2, (vvv - uu) / 2, row, Math.abs(Math.round(uu * 11 + vvv)))
      }
    }
  }

  // Matas planas de transición más allá de los setos (sin altura).
  const g = c.g
  for (let n = 0; n < 90; n++) {
    const u = (unit(n, 41, 720) - 0.5) * 2 * (uEdge + 4.4)
    const v = vMin - 2.6 + unit(n, 43, 721) * (vMax - vMin + 7.2)
    if (Math.abs(u) < uEdge + 0.4) continue // sólo fuera del rombo
    const p = c.at((u + v) / 2, (v - u) / 2)
    const r = (5 + unit(n, 45, 722) * 9) * c.z
    g.fillStyle = unit(n, 47, 723) < 0.5 ? PAL.grass.tuftDark : PAL.grass.forestFloor[1]
    g.globalAlpha = 0.55
    g.beginPath()
    g.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
  }
}
