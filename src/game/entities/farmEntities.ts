/**
 * Entidades con sprite de la granja portrait.
 * Una sola imagen por asset → múltiples drawImage (nunca copias del PNG).
 * depth = worldY (base del objeto), orden pintado: de atrás hacia adelante.
 */
export interface FarmEntity {
  /** Clave en SpriteAssetManager (ruta relativa a /assets/2d/). */
  readonly key: string
  readonly x: number
  readonly y: number
  readonly scale: number
  /** Ancla normalizada [0..1] sobre la imagen: punto que apoya en (x, y). */
  readonly anchorX: number
  readonly anchorY: number
  /** Profundidad de dibujo (= worldY de la base + epsilon por tipo). */
  readonly depth: number
}

import { padCenterWorld, PADS } from '../config/layoutConfig'

/** Escalas calibradas para que los assets convivan en el mundo (tile 64x32). */
const SCALE = {
  tree: [0.115, 0.104, 0.093], // grande / medio / pequeño (mismo PNG)
  shrub: 0.062,
  barn: 0.25,
  house: 0.21,
  pond: 0.23,
  pen: 0.19,
  plot: 0.125,
} as const

/** Árboles: (i, j, variante) — todos con |u| ≤ 6 para que la copa completa
 *  quede dentro del encuadre fijo (borde de banda u=±7 reservado a terreno).
 *  Colocados a mano para no pisar pads, caminos, huertos ni estanque.
 *  Exportados: son TAMBIÉN la fuente de colliders de la IA (world space único). */
export const TREE_SPOTS: ReadonlyArray<readonly [number, number, number]> = [
  [5, 6, 0], [4, 9, 1], [6, 12, 0], // marco izquierdo del granero
  [11, 5, 1], [13, 7, 2], // marco derecho del granero
  [9, 4, 2], [6, 3, 0], [3, 8, 1], // bosque superior
  [14, 8, 0], [16, 10, 2], // transición granero → casa
  [8, 14, 1], [16, 13, 2], // flancos de la reserva casa
  [11, 17, 0], [10, 14, 0], [14, 20, 2], // entre parcelas izquierdas
  [19, 13, 1], [22, 16, 2], [23, 18, 0], // bajada hacia el estanque
  [16, 19, 1], [17, 23, 0], // zona corral izquierda
  [26, 20, 1], [27, 22, 0], // borde derecho bajo el estanque
  [21, 27, 2], [24, 25, 1], // salida inferior del camino
  [20, 26, 0], [24, 28, 2], // muro verde inferior
]

/** Setos decorativos (mismo árbol.png a escala pequeña), |u| ≤ 6. */
const SHRUB_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [16, 14], [25, 25], [15, 21],
]

function worldOf(i: number, j: number): { x: number; y: number } {
  return { x: i + 0.5, y: j + 0.5 }
}

export function createFarmEntities(): FarmEntity[] {
  const entities: FarmEntity[] = []

  // GRANERO: protagonista de la zona superior.
  const barn = worldOf(9, 9)
  entities.push({
    key: 'buildings/barn.png',
    x: barn.x,
    y: barn.y,
    scale: SCALE.barn,
    anchorX: 0.5,
    anchorY: 0.88,
    depth: barn.y,
  })

  // CASA del granjero: cierra el triángulo granero-casa-huertos.
  const house = padCenterWorld(PADS.house)
  entities.push({
    key: 'buildings/house.png',
    x: house.x,
    y: house.y,
    scale: SCALE.house,
    anchorX: 0.5,
    anchorY: 0.88,
    depth: house.y,
  })

  // ESTANQUE: centro visual del agua (bajo el corral, lado derecho).
  const pond = worldOf(23.5, 21.5)
  entities.push({
    key: 'terrain/pond.png',
    x: pond.x,
    y: pond.y,
    scale: SCALE.pond,
    anchorX: 0.5,
    anchorY: 0.52,
    depth: pond.y + 0.01,
  })

  // CORRAL vacío (futuros animales): sin nada encima de su interior.
  const pen = padCenterWorld(PADS.pen)
  entities.push({
    key: 'decoration/animal_pen.png',
    x: pen.x,
    y: pen.y,
    scale: SCALE.pen,
    anchorX: 0.5,
    anchorY: 0.72,
    depth: pen.y + 0.02,
  })

  // HUERTOS: 4 parcelas lógicas independientes, mismo sprite, todas vacías.
  const plots = [PADS.plotA, PADS.plotB, PADS.plotC, PADS.plotD]
  for (const p of plots) {
    const c = padCenterWorld(p)
    entities.push({
      key: 'terrain/farm_plot.png',
      x: c.x,
      y: c.y,
      scale: SCALE.plot,
      anchorX: 0.5,
      anchorY: 0.55,
      depth: c.y + 0.03,
    })
  }

  // ÁRBOLES: misma imagen, escalas ligeramente distintas.
  for (const [i, j, tier] of TREE_SPOTS) {
    const w = worldOf(i, j)
    entities.push({
      key: 'vegetation/tree.png',
      x: w.x,
      y: w.y,
      scale: SCALE.tree[tier % SCALE.tree.length],
      anchorX: 0.5,
      anchorY: 0.92,
      depth: w.y + 0.04,
    })
  }

  // SETOS: mismo árbol.png muy pequeño.
  for (const [i, j] of SHRUB_SPOTS) {
    const w = worldOf(i, j)
    entities.push({
      key: 'vegetation/tree.png',
      x: w.x,
      y: w.y,
      scale: SCALE.shrub,
      anchorX: 0.5,
      anchorY: 0.92,
      depth: w.y + 0.04,
    })
  }

  // Depth sorting estable: de atrás (arriba pantalla) hacia adelante.
  return entities.sort((a, b) => a.depth - b.depth)
}
