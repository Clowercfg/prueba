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

  /** Rutas base de objetos de la granja (identificadores de FarmEntity).
   *  El renderer resuelve el asset FINAL vía hdKey(): .png → .webp.
   *  Árboles: 3 variantes reales tree_01..03 (elección por TREE_SPOTS). */
  paths: {
    tree: 'vegetation/tree_01.png',
    barn: 'buildings/barn.png',
    pond: 'terrain/pond.png',
    pen: 'decoration/animal_pen.png',
    plot: 'terrain/farm_plot.png',
  } as const,

  /**
   * Assets críticos: se precargan DESPUÉS del primer render (nunca bloquean).
   * Terreno base + los objetos visibles de la escena inicial, todos en WebP.
   * El estanque sigue siendo procedural: no existe asset de agua en el pack
   * (el pintor GroundLayer + AmbientLayer lo cubre).
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
    // 'buildings/house.webp' retirado: el webp adoptado era un placeholder
    // corrupto (bloque negro 256x256). La casa vuelve al pintor procedural
    // drawHouse() via fallback #14; si se adopta arte real, bastaria con
    // restaurar el archivo y esta linea.
    'decoration/animal_pen.webp',
    'terrain/farm_plot.webp',
    'vegetation/tree_01.webp',
    'vegetation/tree_02.webp',
    'vegetation/tree_03.webp',
    'vegetation/bush_01.webp',
  ],

  /** Assets secundarios: cargar bajo demanda con loadWhenIdle(). */
  secondary: [] as string[],
} as const
