/**
 * ObjectSprites: cache de sprites por OBJETO estático.
 *
 * Cada árbol, edificio o decoración grande se hornea UNA vez en un canvas
 * offscreen (con su sombra incluida) y cada frame sólo se hace drawImage con
 * culling. Esto da:
 *   - depth-sort real 2.5D: los animales se intercalan por worldY con los
 *     objetos (un corral parte en trasero/frontal para permitirlo).
 *   - cero creación de gradientes/trazados por frame (#16).
 *   - rehorneado por BUCKETS de zoom: el sprite se dibuja a zoom exacto del
 *     bucket y se escala <=6% entre buckets → sin pixelación visible (#19).
 *
 * Dedupe por contenido: árboles del mismo tipo/tamaño comparten canvas
 * gracias al PaintCtx localizado (el pintor usa coords relativas al ancla).
 */

import type { Camera2D } from '../../../game/systems/Camera2D'
import { pt, type PaintCtx } from './shapes'

/** Caja del objeto alrededor de su punto base, en px a zoom 1. */
export interface ObjBounds {
  /** Semi-ancho. */
  hw: number
  /** Alto por encima de la base. */
  up: number
  /** Alto por debajo de la base (sombra). */
  dn: number
}

/**
 * TABLA DE ESCALA (#18): tamaños coherentes entre categorías.
 *   gallina 30px < arbusto 58px < seto 65px < árbol-S 96px < árbol-M 109px
 *   < árbol-L 122px < granero ~190px · vaca 62px cabe 3× en una parcela.
 */
export const OBJ_BOUNDS: Record<string, ObjBounds> = {
  barn: { hw: 120, up: 152, dn: 44 },
  house: { hw: 100, up: 108, dn: 30 },
  penBack: { hw: 116, up: 62, dn: 34 },
  penFront: { hw: 116, up: 62, dn: 40 },
  'tree:oak:0': { hw: 66, up: 138, dn: 30 },
  'tree:oak:1': { hw: 60, up: 125, dn: 28 },
  'tree:oak:2': { hw: 54, up: 112, dn: 26 },
  'tree:pine:*': { hw: 56, up: 132, dn: 26 },
  shrub: { hw: 32, up: 60, dn: 18 },
  bush: { hw: 36, up: 44, dn: 20 },
  cattail: { hw: 24, up: 54, dn: 16 },
  rock: { hw: 28, up: 24, dn: 14 },
  log: { hw: 52, up: 26, dn: 16 },
}

const PAD_PX = 6 // margen AA para no clipar bordes suaves

/** Cuantiza el zoom en pasos del 12.5%: rebaneado barato y sin saltos. */
export function zoomBucket(z: number): number {
  return Math.round(z * 8) / 8
}

interface Baked {
  cv: HTMLCanvasElement
  /** Ancla (base del objeto) dentro del canvas, en px CSS. */
  ax: number
  ay: number
  cssW: number
  cssH: number
  /** Zoom de horneado y DPR de origen. */
  z: number
}

export type ObjPaintFn = (c: PaintCtx) => void

export class ObjectSpriteCache {
  private readonly baked = new Map<string, Baked>()

  /**
   * Devuelve el sprite horneado para (clave de contenido, bucket de zoom).
   * `paint` recibe un PaintCtx LOCALIZADO: el origen (0,0) es la base del
   * objeto → pintores existentes sin cambios y canvases deduplicables.
   */
  get(
    contentKey: string,
    boundsKey: string,
    cam: Camera2D,
    baseWorldX: number,
    baseWorldY: number,
    paint: ObjPaintFn,
  ): Baked {
    const zb = zoomBucket(cam.zoom)
    const key = `${contentKey}|${zb}`
    let b = this.baked.get(key)
    if (b) return b

    const bd = OBJ_BOUNDS[boundsKey] ?? OBJ_BOUNDS.bush
    const cssW = Math.ceil((bd.hw * 2 + PAD_PX) * zb)
    const cssH = Math.ceil((bd.up + bd.dn + PAD_PX) * zb)
    const cv = document.createElement('canvas')
    // Resolución x2 fija: nítido en pantallas retina sin depender del DPR
    // actual (evita rehornear al girar/dispositivos con dpr distinto).
    const q = 2
    cv.width = Math.max(2, Math.ceil(cssW * q))
    cv.height = Math.max(2, Math.ceil(cssH * q))
    const g = cv.getContext('2d')
    if (!g) throw new Error('ObjectSpriteCache: sin contexto 2d')
    g.scale(q, q)

    // Ancla dentro del canvas.
    const ax = (bd.hw + PAD_PX / 2) * zb
    const ay = (bd.up + PAD_PX / 2) * zb
    g.translate(ax, ay)

    // PaintCtx localizado respecto a la base del objeto en pantalla.
    const baseScreen = cam.worldToScreen(baseWorldX, baseWorldY)
    const local: PaintCtx = {
      g,
      z: zb,
      at: (wx, wy) => {
        const p = cam.worldToScreen(wx, wy)
        return { x: p.x - baseScreen.x, y: p.y - baseScreen.y }
      },
    }
    g.imageSmoothingEnabled = true
    paint(local)

    b = { cv, ax, ay, cssW, cssH, z: zb }
    this.baked.set(key, b)
    return b
  }

  /** ¿Existe ya horneado para esta clave de contenido en el bucket actual? */
  has(contentKey: string, cam: Camera2D): boolean {
    return this.baked.has(`${contentKey}|${zoomBucket(cam.zoom)}`)
  }

  /** Vuelca el sprite con escala suave hacia el zoom real. Devuelve false si queda fuera del viewport (#17). */
  blit(
    g: CanvasRenderingContext2D,
    b: Baked,
    cam: Camera2D,
    wx: number,
    wy: number,
    viewW: number,
    viewH: number,
  ): boolean {
    const p = cam.worldToScreen(wx, wy)
    const k = cam.zoom / b.z
    const dw = b.cssW * k
    const dh = b.cssH * k
    const dx = p.x - b.ax * k
    const dy = p.y - b.ay * k
    const m = 8
    if (dx > viewW + m || dy > viewH + m || dx + dw < -m || dy + dh < -m) return false
    g.drawImage(b.cv, dx, dy, dw, dh)
    return true
  }

  dispose(): void {
    this.baked.clear()
  }
}

/**
 * Pinta el objeto DIRECTAMENTE sobre el ctx principal (fallback del
 * presupuesto de horneado): mismo resultado visual, sin cachear aún.
 */
export function paintObjectDirect(
  g: CanvasRenderingContext2D,
  cam: Camera2D,
  wx: number,
  wy: number,
  paint: ObjPaintFn,
): void {
  const p = cam.worldToScreen(wx, wy)
  g.save()
  g.translate(p.x, p.y)
  g.imageSmoothingEnabled = true
  paint({
    g,
    z: cam.zoom,
    at: (lx, ly) => {
      const q = cam.worldToScreen(lx, ly)
      return { x: q.x - p.x, y: q.y - p.y }
    },
  })
  g.restore()
}

/** Utilidad para pintores que quieren un punto elevado dentro del bake local. */
export function localPt(c: PaintCtx, wx: number, wy: number, elevPx: number): { x: number; y: number } {
  return pt(c, wx, wy, elevPx)
}
