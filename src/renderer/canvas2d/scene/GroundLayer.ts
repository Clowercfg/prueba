/**
 * GroundLayer: superficie de terreno CONTINUA.
 *
 * Técnica: se pinta el mundo en un buffer de baja resolución (k px por tile)
 * en coordenadas de mundo y se reescala con interpolación bilineal aplicando
 * la transformación isométrica. El resultado son manchas orgánicas suaves:
 * NUNCA se perciben rombos ni rejilla. Encima van detalles nítidos
 * (briznas, flores, piedras) que dan textura sin reconstrir el mosaico.
 */
import { TerrainType, type TileData } from '../../../game/types'
import type { TileSystem } from '../../../game/systems/TileSystem'
import type { Camera2D } from '../../../game/systems/Camera2D'
import { BAND_CONFIG } from '../../../game/config/layoutConfig'
import { PAL, withAlpha } from './palette'
import { fbm, hash2, unit } from './rng'
import { createPaintCtx, groundEllipseAxes, type PaintCtx, type Vec2S } from './shapes'

/** Estanque (debe coincidir con TileSystem.generate → fillPond). */
export const POND = { cx: 24, cy: 22, rx: 2.5, ry: 2.1 } as const

/** px de buffer por unidad de mundo. 12 → blur natural al reescalar ~4-5x. */
const K = 12

export class GroundLayer {
  private readonly tiles: TileSystem
  private groundBuf: HTMLCanvasElement

  private considered = 0
  private drawn = 0

  /** Arte real activo: las tiles de pasto quedan transparentes (foto debajo). */
  artActive = false

  constructor(tiles: TileSystem) {
    this.tiles = tiles
    this.groundBuf = this.buildGroundBuffer()
  }

  /**
   * Activa/desactiva el arte real del piso. Si cambia, rehorna el buffer:
   * con arte, pasto/bosque son transparentes y paths/tierra/agua siguen.
   */
  setGroundArt(on: boolean): void {
    if (on === this.artActive) return
    this.artActive = on
    this.groundBuf = this.buildGroundBuffer()
  }

  get stats(): { drawn: number; considered: number; total: number } {
    return {
      drawn: this.drawn,
      considered: this.considered,
      total: this.tiles.tileCount,
    }
  }

  /** Color base de una tile según tipo + ruido de mancha grande. */
  private colorFor(t: TileData): string {
    const tones =
      t.type === TerrainType.FOREST
        ? PAL.grass.forestFloor
        : t.type === TerrainType.GRASS
          ? PAL.grass.tones
          : null
    if (!tones) return null as unknown as string
    const macro = fbm(t.i + 0.5, t.j + 0.5, 31)
    const idx = Math.min(tones.length - 1, Math.floor(macro * tones.length))
    return tones[idx]
  }

  private forEachTile(fn: (t: TileData) => void): void {
    for (let j = 0; j < this.tiles.height; j++) {
      for (let i = 0; i < this.tiles.width; i++) {
        const t = this.tiles.getTile(i, j)
        if (!t || t.type === TerrainType.VOID) continue
        fn(t)
      }
    }
  }

  private buildGroundBuffer(): HTMLCanvasElement {
    const buf = document.createElement('canvas')
    buf.width = this.tiles.width * K
    buf.height = this.tiles.height * K
    const g = buf.getContext('2d')!
    g.imageSmoothingEnabled = true

    let drawn = 0
    let considered = 0

    // 1) Relleno por tile (colores vecinos casi idénticos → transición suave).
    //    Con arte real activo, pasto/bosque quedan transparentes: debajo se
    //    pinta terreno.png recortado al rombo; paths/tierra/agua siguen aquí.
    this.forEachTile((t) => {
      considered++
      drawn++
      const col = this.colorFor(t)
      const isFloor =
        t.type === TerrainType.GRASS || t.type === TerrainType.FOREST
      if (this.artActive && isFloor) return
      if (!col) return
      g.fillStyle = col
      g.fillRect(t.i * K, t.j * K, K + 0.5, K + 0.5)

      switch (t.type) {
        case TerrainType.DIRT:
          g.fillStyle = PAL.dirt.yard
          g.fillRect(t.i * K, t.j * K, K + 0.5, K + 0.5)
          break
        case TerrainType.PATH:
          g.fillStyle = unit(t.i, t.j, 3) < 0.3 ? PAL.path.fillWarm : PAL.path.fill
          g.fillRect(t.i * K, t.j * K, K + 0.5, K + 0.5)
          break
        case TerrainType.FARM_SOIL:
          g.fillStyle = PAL.soil.dark
          g.fillRect(t.i * K, t.j * K, K + 0.5, K + 0.5)
          break
        case TerrainType.SAND:
          g.fillStyle = unit(t.i, t.j, 5) < 0.4 ? PAL.coast.sandDeep : PAL.coast.sand
          g.fillRect(t.i * K, t.j * K, K + 0.5, K + 0.5)
          break
        case TerrainType.WATER: {
          g.fillStyle = PAL.water.base
          g.fillRect(t.i * K, t.j * K, K + 0.5, K + 0.5)
          // Profundidad hacia el centro del estanque.
          const dx = t.i + 0.5 - POND.cx
          const dy = t.j + 0.5 - POND.cy
          const nd = Math.hypot(dx / POND.rx, dy / POND.ry)
          g.fillStyle = withAlpha(PAL.water.deep, Math.max(0, 1 - nd) * 0.85)
          g.fillRect(t.i * K, t.j * K, K + 0.5, K + 0.5)
          break
        }
        case TerrainType.ROCK:
          g.fillStyle = PAL.grass.tones[3]
          g.fillRect(t.i * K, t.j * K, K + 0.5, K + 0.5)
          break
        default:
          break
      }
    })

    // 2) Orilla arenosa: tiles activas junto al borde de la banda.
    this.forEachTile((t) => {
      if (!this.touchesVoid(t.i, t.j)) return
      g.fillStyle = PAL.coast.sand
      g.fillRect(t.i * K, t.j * K, K + 0.5, K + 0.5)
      // Núcleo interior del color original para dejar sólo una franja arena.
      const inner = this.colorFor(t)
      const innerIsFloor =
        t.type === TerrainType.GRASS || t.type === TerrainType.FOREST
      if (inner && !(this.artActive && innerIsFloor)) {
        g.fillStyle = inner
        g.fillRect((t.i + 0.16) * K, (t.j + 0.16) * K, K * 0.68, K * 0.68)
      }
    })

    // 2b) Transición arena↔hierba/agua: moteado determinista que funde bordes.
    this.forEachTile((t) => {
      if (t.type !== TerrainType.SAND && t.type !== TerrainType.GRASS) return
      let nGrass = 0
      let nSand = 0
      let nWater = 0
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nt = this.tiles.getType(t.i + di, t.j + dj)
        if (nt === TerrainType.GRASS || nt === TerrainType.FOREST) nGrass++
        else if (nt === TerrainType.SAND) nSand++
        else if (nt === TerrainType.WATER) nWater++
      }
      // Arena invadida por hierba.
      if (t.type === TerrainType.SAND && nGrass > 0) {
        const n = 1 + Math.floor(unit(t.j, t.i, 62) * 3)
        for (let k = 0; k < n; k++) {
          const ox = unit(t.i + k, t.j, 63)
          const oy = unit(t.j - k, t.i, 64)
          g.fillStyle = PAL.grass.tones[2]
          g.fillRect((t.i + ox * 0.85) * K, (t.j + oy * 0.85) * K, K * 0.22, K * 0.22)
        }
      }
      // Hierba secándose hacia la playa.
      if (t.type === TerrainType.GRASS && nSand > 0 && !this.artActive) {
        g.fillStyle = PAL.coast.sandDeep
        g.fillRect(
          (t.i + unit(t.i, t.j, 66) * 0.7) * K,
          (t.j + unit(t.j, t.i, 67) * 0.7) * K,
          K * 0.2,
          K * 0.2,
        )
      }
      // Arena mojada junto al agua.
      if (t.type === TerrainType.SAND && nWater > 0) {
        g.fillStyle = withAlpha(PAL.water.deep, 0.35)
        g.fillRect(
          (t.i + unit(t.i, t.j, 68) * 0.6) * K,
          (t.j + unit(t.j, t.i, 69) * 0.6) * K,
          K * 0.3,
          K * 0.3,
        )
      }
    })

    // 3) Caminos: grafo conectado trazado como línea gruesa con uniones
    //    redondeadas → intersecciones y giros naturales tras el reescalado.
    g.strokeStyle = PAL.path.fill
    g.lineWidth = K * 0.82
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    const segs = new Set<string>()
    for (let j = 0; j < this.tiles.height; j++) {
      for (let i = 0; i < this.tiles.width; i++) {
        if (this.tiles.getType(i, j) !== TerrainType.PATH) continue
        const ax = (i + 0.5) * K
        const ay = (j + 0.5) * K
        for (const [di, dj] of [
          [1, 0],
          [0, 1],
          [1, 1],
          [1, -1],
        ] as const) {
          if (this.tiles.getType(i + di, j + dj) !== TerrainType.PATH) continue
          const key = `${Math.min(i, i + di)},${Math.min(j, j + dj)},${Math.abs(di)},${Math.abs(dj)}`
          if (segs.has(key)) continue
          segs.add(key)
          const bx = (i + di + 0.5) * K
          const by = (j + dj + 0.5) * K
          g.moveTo(ax, ay)
          g.lineTo(bx, by)
        }
        // Disco central: redondea giros y ensancha ligeramente el camino.
        g.moveTo(ax + K * 0.41, ay)
        g.arc(ax, ay, K * 0.41, 0, Math.PI * 2)
      }
    }
    g.stroke()

    // 4) Manchas grandes de luz/sombra sobre el prado (recortadas a tierra).
    g.globalCompositeOperation = 'source-atop'
    for (let gy = 0; gy < this.tiles.height; gy += 2) {
      for (let gx = 0; gx < this.tiles.width; gx += 2) {
        const n = fbm(gx + 1, gy + 1, 77)
        if (n > 0.62) {
          g.fillStyle = PAL.grass.meadowLight
        } else if (n < 0.34) {
          g.fillStyle = PAL.grass.meadowDark
        } else {
          continue
        }
        const cxp = (gx + 1 + (unit(gx, gy, 9) - 0.5)) * K
        const cyp = (gy + 1 + (unit(gy, gx, 10) - 0.5)) * K
        g.beginPath()
        g.ellipse(cxp, cyp, K * 1.7, K * 1.15, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
    g.globalCompositeOperation = 'source-over'

    this.considered = considered
    this.drawn = drawn
    return buf
  }

  private touchesVoid(i: number, j: number): boolean {
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (this.tiles.getType(i + di, j + dj) === TerrainType.VOID) return true
      }
    }
    return false
  }

  /** Transformación buffer-mundo → pantalla, con offset opcional en pantalla. */
  private blitWorld(
    g: CanvasRenderingContext2D,
    cam: Camera2D,
    buf: HTMLCanvasElement,
    offX = 0,
    offY = 0,
    alpha = 1,
  ): void {
    const p0 = cam.worldToScreen(0, 0)
    const z = cam.zoom
    const a = (32 * z) / K
    const d = (16 * z) / K
    g.save()
    g.globalAlpha = alpha
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.transform(a, d, -a, d, p0.x + offX, p0.y + offY)
    g.drawImage(buf, 0, 0)
    g.restore()
  }

  /**
   * Lago de fondo + olas + sombra de la isla + costa + terreno continuo.
   * #25: el exterior ya NO existe. Se pinta una PRADERA CONTINUA que extiende
   * el terreno hasta los cuatro bordes del viewport; la granja se apoya sobre
   * ella y un anillo de vegetación (flora.drawMeadowRing) funde el borde.
   */
  paintBackground(
    g: CanvasRenderingContext2D,
    cam: Camera2D,
    viewW: number,
    viewH: number,
    art?: HTMLImageElement | null,
  ): void {
    // Pradera procedural SIEMPRE (gradiente + manchas macro). El arte real
    // del piso entra recortado al rombo vía blitWorld (buffer con pasto alpha).
    const sky = g.createLinearGradient(0, 0, 0, viewH)
    sky.addColorStop(0, PAL.meadow.hi)
    sky.addColorStop(1, PAL.meadow.lo)
    g.fillStyle = sky
    g.fillRect(0, 0, viewW, viewH)

    const seedBase = hash2(viewW | 0, viewH | 0, 1234)
    const diag = Math.hypot(viewW, viewH)
    for (let n = 0; n < 80; n++) {
      const h1 = hash2(seedBase, n, 17)
      const h2 = hash2(n, seedBase, 29)
      const x = ((h1 % 1000) / 1000) * viewW
      const y = ((h2 % 1000) / 1000) * viewH
      const r = (10 + ((h1 >>> 7) % 30)) * (diag / 900)
      g.fillStyle = n % 2 === 0 ? PAL.grass.meadowLight : PAL.grass.meadowDark
      g.beginPath()
      g.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2)
      g.fill()
    }

    // Piso real de la granja: terreno.png recortado al paralelogramo de la
    // banda (u∈[-(halfU+1),halfU+1] × v∈[vMin,vMax+2], inflado 0.4 tiles).
    if (art && art.naturalWidth > 0 && art.naturalHeight > 0) {
      const uE = BAND_CONFIG.halfU + 1 + 0.4
      const v0 = BAND_CONFIG.vMin - 0.4
      const v1 = BAND_CONFIG.vMax + 2 + 0.4
      const corner = (u: number, v: number) => cam.worldToScreen((v + u) / 2, (v - u) / 2)
      const q = [corner(-uE, v0), corner(uE, v0), corner(uE, v1), corner(-uE, v1)]
      let bx0 = Infinity
      let by0 = Infinity
      let bx1 = -Infinity
      let by1 = -Infinity
      for (const p of q) {
        if (p.x < bx0) bx0 = p.x
        if (p.y < by0) by0 = p.y
        if (p.x > bx1) bx1 = p.x
        if (p.y > by1) by1 = p.y
      }
      g.save()
      g.beginPath()
      g.moveTo(q[0].x, q[0].y)
      for (let k = 1; k < 4; k++) g.lineTo(q[k].x, q[k].y)
      g.closePath()
      g.clip()
      const s = Math.max((bx1 - bx0) / art.naturalWidth, (by1 - by0) / art.naturalHeight)
      const dw = art.naturalWidth * s
      const dh = art.naturalHeight * s
      g.drawImage(art, (bx0 + bx1 - dw) / 2, (by0 + by1 - dh) / 2, dw, dh)
      g.restore()
    }

    // Terreno de la granja encima de la pradera continua.
    this.blitWorld(g, cam, this.groundBuf)
  }

  /**
   * Contorno ORGÁNICO del estanque: elipse base deformada con ruido
   * determinista → orilla irregular, nunca un círculo perfecto.
   * Devuelve puntos ya proyectados en pantalla (cerrados, sin repetir).
   */
  static pondOutline(c: PaintCtx, inflate = 1): Vec2S[] {
    const N = 16
    const pts: Vec2S[] = []
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2
      const wob =
        1 +
        0.15 * (fbm(Math.cos(a) * 1.6 + 7.3, Math.sin(a) * 1.6 + 2.9, 91) - 0.5) * 2 +
        0.05 * Math.sin(a * 3 + 1.7)
      const rx = POND.rx * wob * inflate
      const ry = POND.ry * wob * inflate
      pts.push(c.at(POND.cx + Math.cos(a) * rx, POND.cy + Math.sin(a) * ry))
    }
    return pts
  }

  /**
   * Agua estática: profundidad, brillos de orilla y nenúfares sobre el
   * contorno orgánico. Se llama después del terreno y antes de los objetos.
   */
  paintWaterStatic(g: CanvasRenderingContext2D, cam: Camera2D): void {
    const c = createPaintCtx(g, cam)
    const outline = GroundLayer.pondOutline(c, 1.03)

    // Velo de profundidad radial recortado al contorno orgánico.
    g.save()
    fillSmoothClosed(g, outline)
    g.clip()
    const ctr = c.at(POND.cx, POND.cy)
    const axes = groundEllipseAxes(POND.rx, POND.ry, cam.zoom)
    const grad = g.createRadialGradient(ctr.x, ctr.y, axes.sx * 0.08, ctr.x, ctr.y, axes.sx * 1.05)
    grad.addColorStop(0, withAlpha(PAL.water.deep, 0.62))
    grad.addColorStop(0.72, withAlpha(PAL.water.shallow, 0.10))
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(ctr.x - axes.sx * 1.2, ctr.y - axes.sy * 2.4, axes.sx * 2.4, axes.sy * 4.8)
    g.restore()

    // Orilla: sombra superior (pared de la orilla) y brillo inferior.
    strokeHalf(g, outline, c.at(POND.cx, POND.cy).y, 'top', withAlpha('#1d4a6b', 0.20), 2.6 * c.z)
    strokeHalf(g, outline, c.at(POND.cx, POND.cy).y, 'bottom', PAL.water.rim, 2.8 * c.z)

    // Vegetación de orilla: hierba colgando sobre el agua + piedras húmedas.
    for (let k = 0; k < 7; k++) {
      const idx = Math.floor(unit(k, 81, 82) * outline.length)
      const p = outline[idx]
      const side = unit(k, 83, 84) > 0.5 ? 1 : -1
      g.strokeStyle = withAlpha(k % 3 === 0 ? '#3f8f3f' : '#58a94c', 0.85)
      g.lineWidth = 1.3 * c.z
      g.lineCap = 'round'
      g.beginPath()
      for (let b = -1; b <= 1; b++) {
        g.moveTo(p.x + b * 2.4 * c.z, p.y + side * 1 * c.z)
        g.quadraticCurveTo(
          p.x + b * 3.4 * c.z,
          p.y - side * 3.4 * c.z,
          p.x + b * 4.6 * c.z + side * 1.5 * c.z,
          p.y - side * 6 * c.z,
        )
      }
      g.stroke()
      if (k % 3 === 1) {
        // Guijarro medio hundido en la orilla.
        shadowFlat(g, p.x + 2 * c.z, p.y + 1.5 * c.z, 4.2 * c.z, 2.1 * c.z, 0.18)
        g.fillStyle = PAL.flora.rockShade
        g.beginPath()
        g.ellipse(p.x, p.y, 4 * c.z, 2.6 * c.z, 0.2, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = PAL.flora.rockLit
        g.beginPath()
        g.ellipse(p.x - 1 * c.z, p.y - 1 * c.z, 2.8 * c.z, 1.6 * c.z, 0.2, 0, Math.PI * 2)
        g.fill()
      }
    }

    this.paintLilyPad(c, 22.85, 21.25, 0.34, 2.1)
    this.paintLilyPad(c, 25.05, 22.55, 0.27, 4.7)
    this.paintLilyPad(c, 23.55, 23.15, 0.3, 0.6)
  }

  private paintLilyPad(
    c: PaintCtx,
    wx: number,
    wy: number,
    rWu: number,
    seed: number,
  ): void {
    const g = c.g
    const ctr = c.at(wx, wy)
    const axes = groundEllipseAxes(rWu, rWu * 0.8, c.z)
    const rot = unit(wx, wy, 50 + seed) * Math.PI * 2

    // Sombra del nenúfar sobre el agua.
    shadowFlat(g, ctr.x + 2 * c.z, ctr.y + 2.5 * c.z, axes.sx, axes.sy, 0.25)

    g.save()
    g.translate(ctr.x, ctr.y)
    g.rotate(rot)
    const notch = 0.62 // radianes del sector cortado
    g.beginPath()
    g.moveTo(0, 0)
    g.arc(0, 0, axes.sx, notch / 2, Math.PI * 2 - notch / 2)
    g.closePath()
    g.scale(1, axes.sy / axes.sx)
    g.fillStyle = PAL.water.lily
    g.fill()
    g.strokeStyle = PAL.water.lilyLit
    g.lineWidth = (1.6 * c.z) / (axes.sy / axes.sx)
    g.stroke()
    // Vena central.
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(axes.sx * 0.82, 0)
    g.strokeStyle = withAlpha(PAL.water.lilyLit, 0.7)
    g.lineWidth = (1.1 * c.z) / (axes.sy / axes.sx)
    g.stroke()
    g.restore()
  }

  /**
   * Detalle nítido por tile: briznas, flores, tréboles, guijarros, helechos…
   * Se dibuja DESPUÉS del blit continuo y ANTES de los objetos.
   */
  /**
   * Detalle nítido por tile. Con viewW/viewH (>0) aplica CULLING de viewport
   * (#17): los tiles proyectados fuera del rect (con margen) no se pintan.
   */
  paintDetails(
    g: CanvasRenderingContext2D,
    cam: Camera2D,
    viewW = Number.POSITIVE_INFINITY,
    viewH = Number.POSITIVE_INFINITY,
  ): void {
    const c = createPaintCtx(g, cam)
    // AABB visible en coords de mundo, expandido 1.5 tiles de margen.
    const c0 = cam.screenToWorld(-96, -96)
    const c1 = cam.screenToWorld(viewW + 96, -96)
    const c2 = cam.screenToWorld(-96, viewH + 96)
    const c3 = cam.screenToWorld(viewW + 96, viewH + 96)
    const minX = Math.min(c0.x, c1.x, c2.x, c3.x) - 1.5
    const maxX = Math.max(c0.x, c1.x, c2.x, c3.x) + 1.5
    const minY = Math.min(c0.y, c1.y, c2.y, c3.y) - 1.5
    const maxY = Math.max(c0.y, c1.y, c2.y, c3.y) + 1.5

    this.forEachTile((t) => {
      if (viewW !== Number.POSITIVE_INFINITY) {
        const tx = t.i + 0.5
        const ty = t.j + 0.5
        if (tx < minX || tx > maxX || ty < minY || ty > maxY) return
      }
      const r1 = unit(t.i, t.j, 11)
      switch (t.type) {
        case TerrainType.GRASS:
          if (r1 < 0.06) drawFlower(c, t.i, t.j)
          else if (r1 < 0.16) drawTuft(c, t.i, t.j, r1 < 0.11)
          else if (r1 < 0.21) drawClover(c, t.i, t.j)
          break
        case TerrainType.FOREST:
          if (r1 < 0.3) drawFern(c, t.i, t.j)
          else if (r1 < 0.42) drawMossPatch(c, t.i, t.j)
          break
        case TerrainType.PATH:
          if (r1 < 0.55) drawPebbles(c, t.i, t.j, 2 + Math.floor(unit(t.j, t.i, 13) * 3))
          break
        case TerrainType.SAND:
          if (r1 < 0.1) drawShell(c, t.i, t.j)
          else if (r1 < 0.24) drawPebbles(c, t.i, t.j, 1 + Math.floor(unit(t.j, t.i, 15) * 2))
          break
        case TerrainType.DIRT:
          if (r1 < 0.2) drawStrawFleck(c, t.i, t.j)
          else if (r1 < 0.3) drawPebbles(c, t.i, t.j, 1)
          break
        default:
          break
      }
    })
  }
}

/* ------------------------------------------------------------------ */
/* Detalles pequeños (funciones libres, comparten estilo)              */
/* ------------------------------------------------------------------ */

/** Trazado suave y cerrado (curvas cuadráticas por puntos medios). */
function smoothClosedPath(g: CanvasRenderingContext2D, pts: Vec2S[]): void {
  const n = pts.length
  if (n < 3) return
  g.beginPath()
  g.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2)
  for (let k = 0; k < n; k++) {
    const p = pts[k]
    const q = pts[(k + 1) % n]
    g.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2)
  }
  g.closePath()
}

function fillSmoothClosed(g: CanvasRenderingContext2D, pts: Vec2S[]): void {
  smoothClosedPath(g, pts)
}

/** Traza el contorno cerrado sólo en la mitad superior o inferior. */
function strokeHalf(
  g: CanvasRenderingContext2D,
  pts: Vec2S[],
  centerY: number,
  half: 'top' | 'bottom',
  color: string,
  widthPx: number,
): void {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  g.save()
  g.beginPath()
  if (half === 'top') {
    g.rect(minX - 10, minY - 10, maxX - minX + 20, centerY - minY + 10)
  } else {
    g.rect(minX - 10, centerY, maxX - minX + 20, maxY - centerY + 10)
  }
  g.clip()
  smoothClosedPath(g, pts)
  g.strokeStyle = color
  g.lineWidth = widthPx
  g.stroke()
  g.restore()
}

function jitterPos(i: number, j: number, salt: number, spread = 0.42): { x: number; y: number } {
  return {
    x: i + 0.5 + (unit(i, j, salt) - 0.5) * 2 * spread,
    y: j + 0.5 + (unit(j, i, salt + 1) - 0.5) * 2 * spread,
  }
}

function drawTuft(c: PaintCtx, i: number, j: number, light: boolean): void {
  const g = c.g
  const p = jitterPos(i, j, 21)
  const s = c.at(p.x, p.y)
  const hgt = 4.5 * c.z
  g.strokeStyle = light ? PAL.grass.tuftLight : PAL.grass.tuftDark
  g.lineWidth = 1.3 * c.z
  g.lineCap = 'round'
  g.beginPath()
  for (const dx of [-1, 0, 1]) {
    g.moveTo(s.x + dx * 2 * c.z, s.y)
    g.quadraticCurveTo(s.x + dx * 3.2 * c.z, s.y - hgt * 0.6, s.x + dx * 4.2 * c.z, s.y - hgt)
  }
  g.stroke()
}

function drawClover(c: PaintCtx, i: number, j: number): void {
  const g = c.g
  const p = jitterPos(i, j, 23, 0.36)
  const s = c.at(p.x, p.y)
  g.fillStyle = PAL.grass.meadowLight
  g.beginPath()
  g.ellipse(s.x, s.y, 5 * c.z, 2.6 * c.z, 0, 0, Math.PI * 2)
  g.fill()
}

function drawFlower(c: PaintCtx, i: number, j: number): void {
  const g = c.g
  const p = jitterPos(i, j, 25, 0.38)
  const s = c.at(p.x, p.y)
  const kind = Math.floor(unit(i, j, 26) * PAL.flowers.petals.length)
  const petal = PAL.flowers.petals[kind]
  const r = 1.7 * c.z
  // Tallo.
  g.strokeStyle = PAL.flora.oakShade
  g.lineWidth = 1 * c.z
  g.beginPath()
  g.moveTo(s.x, s.y)
  g.lineTo(s.x, s.y - 4 * c.z)
  g.stroke()
  // Pétalos (4 puntos) + centro.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.6
    g.fillStyle = petal
    g.beginPath()
    g.arc(s.x + Math.cos(a) * r, s.y - 4 * c.z + Math.sin(a) * r, r * 0.72, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = PAL.flowers.center
  g.beginPath()
  g.arc(s.x, s.y - 4 * c.z, r * 0.55, 0, Math.PI * 2)
  g.fill()
}

function drawFern(c: PaintCtx, i: number, j: number): void {
  const g = c.g
  const p = jitterPos(i, j, 27)
  const s = c.at(p.x, p.y)
  g.strokeStyle = withAlpha(PAL.flora.pineMid, 0.8)
  g.lineWidth = 1.2 * c.z
  g.lineCap = 'round'
  g.beginPath()
  for (const dx of [-1, 0, 1]) {
    g.moveTo(s.x, s.y)
    g.quadraticCurveTo(s.x + dx * 4 * c.z, s.y - 5 * c.z, s.x + dx * 6 * c.z, s.y - 8.5 * c.z)
  }
  g.stroke()
}

function drawMossPatch(c: PaintCtx, i: number, j: number): void {
  const g = c.g
  const p = jitterPos(i, j, 29, 0.4)
  const s = c.at(p.x, p.y)
  g.fillStyle = withAlpha(PAL.flora.rockMoss, 0.35)
  g.beginPath()
  g.ellipse(s.x, s.y, 4.5 * c.z, 2.4 * c.z, 0, 0, Math.PI * 2)
  g.fill()
}

function drawPebbles(c: PaintCtx, i: number, j: number, count: number): void {
  const g = c.g
  for (let n = 0; n < count; n++) {
    const p = jitterPos(i + n * 0.13, j - n * 0.09, 31 + n, 0.44)
    const s = c.at(p.x, p.y)
    const r = (1.1 + unit(i, j + n, 33) * 1.2) * c.z
    g.fillStyle = PAL.path.stone
    g.beginPath()
    g.ellipse(s.x, s.y, r, r * 0.66, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = withAlpha('#ffffff', 0.35)
    g.beginPath()
    g.ellipse(s.x - r * 0.25, s.y - r * 0.3, r * 0.45, r * 0.28, 0, 0, Math.PI * 2)
    g.fill()
  }
}

function drawShell(c: PaintCtx, i: number, j: number): void {
  const g = c.g
  const p = jitterPos(i, j, 35, 0.4)
  const s = c.at(p.x, p.y)
  g.strokeStyle = withAlpha('#ffffff', 0.75)
  g.lineWidth = 1.2 * c.z
  g.beginPath()
  g.arc(s.x, s.y, 2.2 * c.z, Math.PI * 0.15, Math.PI * 0.85)
  g.stroke()
}

function drawStrawFleck(c: PaintCtx, i: number, j: number): void {
  const g = c.g
  const p = jitterPos(i, j, 37, 0.46)
  const s = c.at(p.x, p.y)
  g.strokeStyle = PAL.dirt.straw
  g.lineWidth = 1.1 * c.z
  g.lineCap = 'round'
  g.beginPath()
  const a = unit(i, j, 38) * Math.PI
  g.moveTo(s.x - Math.cos(a) * 2.4 * c.z, s.y - Math.sin(a) * 1.2 * c.z)
  g.lineTo(s.x + Math.cos(a) * 2.4 * c.z, s.y + Math.sin(a) * 1.2 * c.z)
  g.stroke()
}

/** Elipse plana oscura (sombra apoyada sobre agua/suelo). */
function shadowFlat(
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
