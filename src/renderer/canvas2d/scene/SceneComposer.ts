/**
 * SceneComposer: compone la escena en BANDAS (#12) con depth-sort real 2.5D.
 *
 *   BANDA DE TIERRA (cache estÃ¡tico, se rebuilda sÃ³lo si cambia cÃ¡mara):
 *     1. Lago + olas + isla + playa + acantilado + terreno continuo
 *     2. Agua estÃ¡tica del estanque (nenÃºfares)
 *     3. Detalle nÃ­tido del suelo (con culling de viewport #17)
 *     3b. DecoraciÃ³n plana pequeÃ±a (ramas, hojas, piedras)
 *     3c. Parcelas excavadas (cultivos incluidos)
 *
 *   BANDA DE OBJETOS (por frame, y-sort por worldY + animales intercalados):
 *     Ã¡rboles/setos/arbustos/juncos/rocas/troncos Â· granero Â· corral en dos
 *     mitades Â· ANIMALES. Un objeto detrÃ¡s queda detrÃ¡s; el de delante tapa.
 *
 *   ACABADO: luz cÃ¡lida + viÃ±eta como OVERLAY por frame (gradientes
 *   cacheados #16) para que tambiÃ©n afecte a animales y objetos dinÃ¡micos.
 */
import type { Camera2D } from '../../../game/systems/Camera2D'
import type { TileSystem } from '../../../game/systems/TileSystem'
import type { FarmEntity } from '../../../game/entities/farmEntities'
import { PADS, WORLD_BOUNDS } from '../../../game/config/layoutConfig'
import { GroundLayer } from './GroundLayer'
import { AmbientLayer } from './ambient'
import { AnimalLayer, type AnimalView } from './animals'
import {
  generateForestDecor,
  drawBush,
  drawCattail,
  drawDecor,
  drawLog,
  drawMeadowRing,
  drawOak,
  drawPine,
  drawRockCluster,
  type DecorItem,
} from './flora'
import { drawBarn, drawBuildingSelection, drawHouse, drawPen, drawPenFloor, drawPlotsGround, type PenPart } from './buildings'
import { drawPlotSelection } from './plots'
import { createPaintCtx } from './shapes'
import { ObjectSpriteCache, paintObjectDirect, zoomBucket, type ObjPaintFn } from './ObjectSprites'
import { unit } from './rng'

interface SortEntry {
  /** Clave de orden: worldY de la base (+ epsilon por tipo). */
  sy: number
  /** Ancla mundo del sprite horneado. */
  wx: number
  wy: number
  /** Clave de contenido (dedupe del cache). */
  ck: string
  /** Clave de bounds en OBJ_BOUNDS. */
  bk: string
  paint: ObjPaintFn
  /**
   * SEAM #14: si hay un asset real cargado en SpriteAssetManager para esta
   * clave, se dibuja Ã‰L en lugar del pintor procedural (mismo ancla/escala).
   */
  assetKey?: string
  scale?: number
  anchorX?: number
  anchorY?: number
  /** Garnish de fondo (#15): sin bake listo se OMITE ese frame (nunca directo). */
  lazy?: boolean
}

const TINY_KINDS = new Set(['twig', 'leaves', 'stone', 'shoreStone'])

/**
 * SelecciÃ³n estructural que el composer puede pintar (desacoplado del store).
 */
export type Highlight =
  | { kind: 'plot'; id: string }
  | { kind: 'animal'; id: string }
  | { kind: 'building'; id: string }
  | null

/** Hooks opcionales inyectados desde fuera (estado de juego real). */
export interface ComposerHooks {
  /** Crecimiento visible por parcela (índice = plotA..plotD). */
  getGrowths?: () => number[]
  /** Vistas visuales de los animales REALES (registry), una por frame. */
  getAnimals?: () => readonly AnimalView[]
}

/**
 * Clave de asset FINAL para una entidad (#14). Los sprites procedurales son
 * el placeholder de calidad; cuando exista p.ej. buildings/barn_hd.png en
 * /public/assets/2d/ (aÃ±adiendo su clave a ASSETS_CONFIG.critical), se
 * adopta automÃ¡ticamente SIN tocar este renderer.
 */
function hdKey(entityKey: string): string {
  return entityKey.replace(/\.png$/, '_hd.png')
}

export class SceneComposer {
  private readonly camera: Camera2D
  private readonly entities: FarmEntity[]
  private readonly ground: GroundLayer
  private readonly ambient = new AmbientLayer()
  private readonly animals = new AnimalLayer()
  private readonly sprites = new ObjectSpriteCache()
  /** Puente al SpriteSystem existente; null = sÃ³lo procedural (#14). */
  private readonly assets: {
    get(key: string): HTMLImageElement | null
  } | null
  private readonly decor: DecorItem[]

  /** Entradas estÃ¡ticas preconstruidas (nunca cambian por frame). */
  private readonly staticEntries: SortEntry[] = []
  /** Array reutilizado cada frame: estÃ¡ticas + animales. */
  private readonly frameEntries: SortEntry[] = []
  private readonly animalWrappers = new Map<string, { e: SortEntry; v: AnimalView; seen?: boolean }>()

  private cache: HTMLCanvasElement | null = null
  private cacheKey = ''
  private lastBuildMs = 0
  /** Â¿El Ãºltimo horneado incluyÃ³ el arte real (huertos / fondo / anillo)? */
  private plotArtInCache = false
  private bgArtInCache = false
  private ringArtInCache = false

  /** Gradientes del acabado, cacheados por tamaÃ±o de viewport (#16). */
  private gradeKey = ''
  private warmGrad: CanvasGradient | null = null
  private vigGrad: CanvasGradient | null = null

  private tileStats = { drawn: 0, considered: 0, total: 0 }
  private drawnLastFrame = 0
  private highlight: Highlight = null

  constructor(
    camera: Camera2D,
    tiles: TileSystem,
    entities: FarmEntity[],
    assets?: { get(key: string): HTMLImageElement | null } | null,
    private hooks: ComposerHooks = {},
  ) {
    this.camera = camera
    this.entities = entities
    this.ground = new GroundLayer(tiles)
    this.decor = generateForestDecor(tiles)
    this.tileStats = this.ground.stats
    this.assets = assets ?? null
    this.buildStaticEntries()
  }

  /* ------------------------------------------------------------ */
  /* Registro de objetos estÃ¡ticos ordenables                      */
  /* ------------------------------------------------------------ */

  private buildStaticEntries(): void {
    const out = this.staticEntries

    for (const e of this.entities) {
      if (e.key.endsWith('pond.png')) continue // agua â†’ banda de tierra
      if (e.key.endsWith('farm_plot.png')) continue // parcela â†’ banda de tierra

      if (e.key.endsWith('barn.png')) {
        // Base visual del granero = pie de la pared frontal.
        const pad = PADS.barn
        const cy = (pad.y0 + pad.y1 + 1) / 2
        const fd = pad.y1 + 1 - pad.y0 - 1.35
        const frontY = cy + fd / 2
        out.push({
          sy: frontY,
          wx: e.x,
          wy: e.y,
          ck: 'barn',
          bk: 'barn',
          paint: (c) => void drawBarn(c),
          assetKey: hdKey(e.key),
          scale: e.scale,
          anchorX: e.anchorX,
          anchorY: e.anchorY,
        })
        continue
      }

      if (e.key.endsWith('house.png')) {
        const pad = PADS.house
        const cy = (pad.y0 + pad.y1 + 1) / 2
        const fd = pad.y1 + 1 - pad.y0 - 1.5
        out.push({
          sy: cy + fd / 2,
          wx: e.x,
          wy: e.y,
          ck: 'house',
          bk: 'house',
          paint: (c) => void drawHouse(c),
          assetKey: hdKey(e.key),
          scale: e.scale,
          anchorX: e.anchorX,
          anchorY: e.anchorY,
        })
        continue
      }

      if (e.key.endsWith('animal_pen.png')) {
        const parts: Array<[PenPart, string]> = [
          ['back', 'penBack'],
          ['front', 'penFront'],
        ]
        // sortY con asset plano: back BAJO la imagen, imagen BAJO animales.
        // Sin asset cargado, la valla procedural conserva su sÃ¡ndwich original.
        const sortYs: Record<PenPart, number> = {
          back: PADS.pen.y0 - 0.02,
          front: PADS.pen.y1 + 1.05,
        }
        const IMG_SY = PADS.pen.y0 - 0.01
        for (const [part, bk] of parts) {
          out.push({
            sy: sortYs[part],
            wx: e.x,
            wy: e.y,
            ck: `pen:${part}`,
            bk,
            paint: (c) => void drawPen(c, PADS.pen, part),
            // El asset real del corral es una sola imagen plana: se dibuja
            // BAJO cualquier animal (los sprites la tapan al pasar).
            ...(part === 'front'
              ? {
                  assetKey: hdKey(e.key),
                  scale: e.scale,
                  anchorX: e.anchorX,
                  anchorY: e.anchorY,
                  sy: IMG_SY,
                }
              : {}),
          })
        }
        continue
      }

      if (e.key.endsWith('tree.png') || e.key.endsWith('shrub.png')) {
        out.push(this.treeEntry(e))
        continue
      }
    }

    // DecoraciÃ³n generada: grande â†’ ordenable; plana â†’ banda de tierra.
    for (const it of this.decor) {
      if (TINY_KINDS.has(it.kind)) continue
      out.push(this.decorEntry(it))
    }
  }

  /** Ãrbol/seto de entidad, deduplicado por variante+tamaÃ±o+seed cuantizada. */
  private treeEntry(e: FarmEntity): SortEntry {
    const seedRaw = unit(Math.round(e.x * 10), Math.round(e.y * 10), 501)
    const isPine = seedRaw < 0.28 && e.scale >= 0.08
    const tier = e.scale < 0.08 ? -1 : e.scale >= 0.115 ? 0 : e.scale >= 0.104 ? 1 : 2
    // CuantizaciÃ³n gruesa: 2 buckets de semilla â†’ ~12 Ã¡rboles Ãºnicos en vez
    // de ~30 (menos hornado en el primer frame, diferencia visual mÃ­nima).
    const qSeed = Math.round(seedRaw * 2) / 2
    const H = e.scale * 1000

    if (tier === -1) {
      return {
        sy: e.y + 0.04,
        wx: e.x,
        wy: e.y,
        ck: `shrub:${qSeed}`,
        bk: 'shrub',
        paint: (c) => drawBush(c, c.at(e.x, e.y), H * 0.55, qSeed),
        assetKey: hdKey(e.key),
        scale: e.scale,
        anchorX: e.anchorX,
        anchorY: e.anchorY,
      }
    }
    return {
      sy: e.y + 0.04,
      wx: e.x,
      wy: e.y,
      ck: `t:${isPine ? 'pine' : 'oak'}:${tier}:${qSeed}`,
      bk: `tree:${isPine ? 'pine' : 'oak'}:${tier}`,
      paint: (c) => {
        const base = c.at(e.x, e.y)
        if (isPine) drawPine(c, base, H * 1.04, qSeed)
        else drawOak(c, base, H, qSeed)
      },
      assetKey: hdKey(e.key),
      scale: e.scale,
      anchorX: e.anchorX,
      anchorY: e.anchorY,
    }
  }

  /** Item de decoraciÃ³n grande: seed y escala CUANTIZADOS para dedupe. */
  private decorEntry(it: DecorItem): SortEntry {
    const qSeed = Math.round(it.seed * 2) / 2
    const qs = Math.round(it.s * 4) / 4 // bucket de tamaÃ±o Â±12%: imperceptible
    const kindMap: Record<string, { bk: string; paint: ObjPaintFn }> = {
      oak: {
        bk: 'tree:oak:0',
        paint: (c) => drawOak(c, c.at(it.x, it.y), qs * 115, qSeed),
      },
      pine: {
        bk: 'tree:pine:*',
        paint: (c) => drawPine(c, c.at(it.x, it.y), qs * 119, qSeed),
      },
      bush: { bk: 'bush', paint: (c) => drawBush(c, c.at(it.x, it.y), 30 * qs, qSeed) },
      cattail: { bk: 'cattail', paint: (c) => drawCattail(c, c.at(it.x, it.y), 34 * qs, qSeed) },
      rock: { bk: 'rock', paint: (c) => drawRockCluster(c, c.at(it.x, it.y), 30 * qs, qSeed) },
      log: { bk: 'log', paint: (c) => drawLog(c, c.at(it.x, it.y), 46 * qs, qSeed) },
    }
    const m = kindMap[it.kind] ?? kindMap.bush
    // TODA la decoraciÃ³n es garnish diferible (#15): sin bake listo se omite
    // ese frame y aparece en los siguientes (~50 ms), nunca pinta directo.
    return {
      sy: it.depth,
      wx: it.x,
      wy: it.y,
      ck: `${it.kind}:${qSeed}:${qs}`,
      bk: m.bk,
      paint: m.paint,
      lazy: true,
    }
  }

  /* ------------------------------------------------------------ */
  /* Stats                                                         */
  /* ------------------------------------------------------------ */

  get terrainStats(): { drawn: number; considered: number; total: number } {
    return this.tileStats
  }

  get objectStats(): { count: number; drawnLastFrame: number; drawOrder: number[] } {
    return {
      count: this.staticEntries.length + this.animals.allViews().length,
      drawnLastFrame: this.drawnLastFrame,
      drawOrder: this.frameEntries.map((e2) => Math.round(e2.sy * 100) / 100),
    }
  }

  get perfStats(): { buildMs: number } {
    return { buildMs: Math.round(this.lastBuildMs * 100) / 100 }
  }

  /* ------------------------------------------------------------ */
  /* Banda de tierra (cache estÃ¡tico)                              */
  /* ------------------------------------------------------------ */

  ensureCache(viewW: number, viewH: number, dpr: number): void {
    const cam = this.camera.position
    const growths = this.hooks.getGrowths?.() ?? null
    const gKey = growths ? `|g${growths.map((v) => Math.round(v * 20)).join('.')}` : ''
    const key = `${viewW}x${viewH}@${dpr}|${cam.x.toFixed(2)},${cam.y.toFixed(2)},${zoomBucket(this.camera.zoom).toFixed(3)}|${this.camera.isFixed}${gKey}`
    // El arte diferido (huertos / fondo) llega tras el primer render: si su
    // presencia cambiÃ³ desde el Ãºltimo horneado, fuerza rebuild una vez.
    if (
      this.cache &&
      (!!this.assets?.get('terrain/farm_plot_hd.png') !== this.plotArtInCache ||
        !!this.assets?.get('terrain/ground_hd.png') !== this.bgArtInCache ||
        !!this.assets?.get('vegetation/ring_tree_hd.png') !== this.ringArtInCache)
    ) {
      this.cacheKey = ''
    }
    if (this.cache && this.cacheKey === key) return

    const t0 = performance.now()
    const cv = document.createElement('canvas')
    cv.width = Math.max(1, Math.ceil(viewW * dpr))
    cv.height = Math.max(1, Math.ceil(viewH * dpr))
    const g = cv.getContext('2d')
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 1-2) Pradera + piso real recortado al rombo + agua estÃ¡tica.
    this.ground.setGroundArt(!!this.assets?.get('terrain/ground_hd.png'))
    this.ground.paintBackground(
      g,
      this.camera,
      viewW,
      viewH,
      this.assets?.get('terrain/ground_hd.png') ?? null,
    )
    this.bgArtInCache = this.ground.artActive
    this.ground.paintWaterStatic(g, this.camera)

    // 3) Detalle nÃ­tido (con culling) + decoraciÃ³n plana.
    this.ground.paintDetails(g, this.camera, viewW, viewH)
    const cg = createPaintCtx(g, this.camera)
    for (const it of this.decor) {
      if (!TINY_KINDS.has(it.kind)) continue
      drawDecor(cg, it)
    }

    // 3c) Parcelas excavadas: Ãºltimo de la banda de tierra, bajo todo objeto.
    const plotArt = this.assets?.get('terrain/farm_plot_hd.png') ?? null
    drawPlotsGround(cg, growths ?? undefined, plotArt)
    this.plotArtInCache = !!plotArt
    // Suelo pisado del corral tambiÃ©n pertenece a esta banda.
    drawPenFloor(cg, PADS.pen)
    // #25: anillo de vegetaciÃ³n que extiende el terreno hasta los bordes.
    drawMeadowRing(cg, this.assets?.get('vegetation/ring_tree_hd.png') ?? null)
    this.ringArtInCache = !!this.assets?.get('vegetation/ring_tree_hd.png')

    this.cache = cv
    this.cacheKey = key
    this.lastBuildMs = performance.now() - t0
  }

  blit(g: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    if (!this.cache) return
    g.drawImage(this.cache, 0, 0, this.cache.width, this.cache.height, 0, 0, viewW, viewH)
  }

  /* ------------------------------------------------------------ */
  /* Banda de objetos: y-sort 2.5D con animales (#12)              */
  /* ------------------------------------------------------------ */

  update(): void {
    // La IA de animales vive en el juego (tickAnimalAI); la capa visual se
    // limita a reflejar el estado real que llega por hooks cada frame.
    const views = this.hooks.getAnimals?.()
    if (views) this.animals.sync(views)
  }

  /** SelecciÃ³n a pintar (halo bajo objetos). No invalida caches. */
  setHighlight(h: Highlight): void {
    this.highlight = h
  }

  /** Hit-test de animales delegado en la capa (targets tÃ¡ctiles generosos). */
  pickAnimal(wx: number, wy: number): string | null {
    return this.animals.hit(wx, wy)?.id ?? null
  }

  drawDynamic(g: CanvasRenderingContext2D, elapsed: number, viewW: number, viewH: number): void {
    const entries = this.frameEntries
    entries.length = 0
    // RECORTE #25: nada anclado fuera del terreno real (WORLD_BOUNDS) se
    // dibuja. Margen de 2.5 tiles: los sprites pueden desbordar visualmente.
    const b = WORLD_BOUNDS
    const M = 2.5
    for (const e of this.staticEntries) {
      if (e.wx < b.minX - M || e.wx > b.maxX + M || e.wy < b.minY - M || e.wy > b.maxY + M) {
        continue
      }
      entries.push(e)
    }

    // Highlight de selecciÃ³n: halo a nivel de suelo, BAJO los objetos.
    if (this.highlight) this.drawHighlight(g, elapsed)

    // Animales como entradas ordenables (wrappers reutilizados por id).
    const views = this.animals.allViews()
    for (const v of views) {
      let w = this.animalWrappers.get(v.id)
      if (!w) {
        const entry: SortEntry = {
          sy: v.y,
          wx: v.x,
          wy: v.y,
          ck: `animal:${v.id}`,
          bk: 'bush',
          paint: () => {},
        }
        w = { e: entry, v, seen: false }
        this.animalWrappers.set(v.id, w)
      }
      w.seen = true
      w.v = v
      w.e.sy = v.y + 0.01 // desempate: el animal queda delante en empate exacto
      w.e.wx = v.x
      w.e.wy = v.y
      w.e.paint = (c) => this.animals.drawView(c, w!.v, elapsed)
      entries.push(w.e)
    }
    // Purga de wrappers huérfanos (animal eliminado del registry).
    for (const [id, w] of this.animalWrappers) {
      if (!w.seen) this.animalWrappers.delete(id)
      else w.seen = false
    }

    // Orden 2.5D: atrÃ¡sâ†’delante por worldY; desempate estable por clave.
    entries.sort((a, b) => a.sy - b.sy || (a.ck < b.ck ? -1 : 1))

    let drawn = 0
    // Presupuesto de horneado por frame (#15): bajo a propÃ³sito â€” cada bake
    // aloja un canvas nuevo y la rÃ¡faga dispara GC en frames tempranos.
    // El resto se pinta directo (idÃ©ntico visualmente) mientras tanto.
    let bakeBudget = 6
    for (const e of entries) {
      // #14: asset real si estÃ¡ cargado; procedural si no.
      const img = e.assetKey ? (this.assets?.get(e.assetKey) ?? null) : null
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        if (blitAsset(g, img, this.camera, e, viewW, viewH)) drawn++
        continue
      }
      if (!this.sprites.has(e.ck, this.camera)) {
        if (e.lazy) continue // aparecerÃ¡ cuando su bake toque (frames 1-4)
        if (bakeBudget <= 0) {
          paintObjectDirect(g, this.camera, e.wx, e.wy, e.paint)
          drawn++
          continue
        }
        bakeBudget--
      }
      const baked = this.sprites.get(e.ck, e.bk, this.camera, e.wx, e.wy, e.paint)
      if (this.sprites.blit(g, baked, this.camera, e.wx, e.wy, viewW, viewH)) drawn++
    }
    this.drawnLastFrame = drawn

    // Ambiente (nubes, oleaje, mariposas).
    const c = createPaintCtx(g, this.camera)
    this.ambient.draw(g, c, elapsed)

    // Acabado por overlay con gradientes cacheados.
    this.paintGrade(g, viewW, viewH)
  }

  /* ------------------------------------------------------------ */
  /* Highlight de selecciÃ³n (#20)                                  */
  /* ------------------------------------------------------------ */

  private drawHighlight(g: CanvasRenderingContext2D, elapsedMs: number): void {
    const h = this.highlight
    if (!h) return
    const c = createPaintCtx(g, this.camera)
    const t = elapsedMs * 1000
    if (h.kind === 'plot') {
      const pad = PADS[h.id as keyof typeof PADS]
      if (pad) drawPlotSelection(c, pad, t)
      return
    }
    if (h.kind === 'building') {
      const pad = PADS[h.id as keyof typeof PADS]
      if (pad) drawBuildingSelection(c, pad, t)
      return
    }
    // Animal: anillo pulsante bajo los pies.
    const v = this.animals.viewById(h.id)
    if (!v) return
    const p = c.at(v.x, v.y)
    const isCow = v.species === 'cow'
    const pulse = 0.5 + 0.5 * Math.sin(t / 300)
    g.fillStyle = `rgba(255,224,138,${0.14 + 0.08 * pulse})`
    g.beginPath()
    g.ellipse(p.x + 1.5 * c.z, p.y + 0.5 * c.z, (isCow ? 30 : 12) * c.z, (isCow ? 13 : 5.5) * c.z, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = `rgba(255,236,170,${0.6 + 0.3 * pulse})`
    g.lineWidth = 2.2 * c.z
    g.stroke()
  }

  /* ------------------------------------------------------------ */
  /* Acabado                                                       */
  /* ------------------------------------------------------------ */

  private paintGrade(g: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    const k = `${viewW}x${viewH}`
    if (this.gradeKey !== k || !this.warmGrad || !this.vigGrad) {
      const warm = g.createLinearGradient(0, 0, viewW * 0.7, viewH * 0.6)
      warm.addColorStop(0, 'rgba(255,238,180,0.10)')
      warm.addColorStop(1, 'rgba(255,238,180,0)')
      const vx = viewW / 2
      const vy = viewH * 0.46
      const vig = g.createRadialGradient(
        vx,
        vy,
        Math.min(viewW, viewH) * 0.42,
        vx,
        vy,
        Math.hypot(viewW, viewH) * 0.62,
      )
      vig.addColorStop(0, 'rgba(10,28,20,0)')
      vig.addColorStop(1, 'rgba(10,28,20,0.17)')
      this.warmGrad = warm
      this.vigGrad = vig
      this.gradeKey = k
    }
    g.fillStyle = this.warmGrad
    g.fillRect(0, 0, viewW, viewH)
    g.fillStyle = this.vigGrad
    g.fillRect(0, 0, viewW, viewH)
  }

  dispose(): void {
    this.sprites.dispose()
    this.cache = null
    this.cacheKey = ''
  }
}

/**
 * Dibuja un asset PNG/WebP real con el ancla/escala de su FarmEntity.
 * Altura objetivo: scaleÂ·1000 px (misma convenciÃ³n que los pintores
 * procedurales) â†’ reemplazo 1:1 sin tocar lÃ³gica (#14/#18).
 */
function blitAsset(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cam: Camera2D,
  e: SortEntry,
  viewW: number,
  viewH: number,
): boolean {
  const p = cam.worldToScreen(e.wx, e.wy)
  const h = (e.scale ?? 0.115) * 1000 * cam.zoom
  const w = h * (img.naturalWidth / img.naturalHeight)
  const dx = p.x - (e.anchorX ?? 0.5) * w
  const dy = p.y - (e.anchorY ?? 0.92) * h
  const m = 8
  if (dx > viewW + m || dy > viewH + m || dx + w < -m || dy + h < -m) return false
  g.drawImage(img, dx, dy, w, h)
  return true
}
