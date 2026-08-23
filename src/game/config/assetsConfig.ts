/**
 * Configuración de assets 2.5D.
 * Formato: WebP con transparencia (los grandes); tiles de terreno dev en PNG
 * 64×64 (~500 B cada uno). Los sprites se generan con: npm run assets:generate
 */
export const ASSETS_CONFIG = {
  /**
   * Raíz pública de sprites. DEBE derivarse de BASE_URL: GitHub Pages sirve
   * bajo /prueba/ y una ruta absoluta '/assets/2d/' da 404 (el manager cae
   * a procedural sin avisar).
   */
  baseUrl: `${import.meta.env.BASE_URL}assets/2d/`,

  /** Tamaño (px) de la textura cuadrada que mapea al rombo isométrico. */
  spriteSize: 64,

  /**
   * Rutas base de objetos de la granja (identificadores de FarmEntity).
   * El renderer resuelve el asset FINAL vía hdKey(): .png → .webp.
   */
  paths: {
    tree: 'vegetation/tree.png',
    barn: 'buildings/barn.png',
    pond: 'terrain/pond.png',
    pen: 'decoration/animal_pen.png',
    plot: 'terrain/farm_plot.png',
  } as const,

  /**
   * Assets críticos: se precargan DESPUÉS del primer render (nunca bloquean).
   * Terreno base + los objetos visibles de la escena inicial, todos en WebP
   * (total ≈ 0.93 MB). Los árboles/estanque son procedurales: sin asset.
   */
  critical: [
    'terrain/ground.webp',
    'terrain/grass_01.png',
    'terrain/grass_02.png',
    'terrain/grass_03.png',
    'terrain/grass_04.png',
    'terrain/water_01.png',
    'terrain/water_02.png',
    'terrain/dirt_01.png',
    'vegetation/ring_tree.webp',
    'buildings/barn.webp',
    'decoration/animal_pen.webp',
    'terrain/farm_plot.webp',
  ],

  /** Assets secundarios: cargar bajo demanda con loadWhenIdle(). */
  secondary: [] as string[],
} as const
