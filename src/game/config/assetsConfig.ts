/**
 * Configuración de assets 2.5D.
 * Formato preferido: WebP con transparencia; PNG solo cuando sea necesario.
 * Los sprites dev de terreno se generan con: npm run assets:generate
 */
export const ASSETS_CONFIG = {
  /** Raíz pública de sprites (servida por Vite desde /public). */
  baseUrl: '/assets/2d/',

  /** Tamaño (px) de la textura cuadrada que mapea al rombo isométrico. */
  spriteSize: 64,

  /** Rutas de objetos de la granja (claves claras para SpriteAssetManager). */
  paths: {
    tree: 'vegetation/tree.png',
    barn: 'buildings/barn.png',
    pond: 'terrain/pond.png',
    pen: 'decoration/animal_pen.png',
    plot: 'terrain/farm_plot.png',
  } as const,

  /**
   * Assets críticos: se precargan DESPUÉS del primer render (nunca bloquean).
   * Terreno base + los 5 objetos de la granja portrait.
   */
  critical: [
    'terrain/grass_01.png',
    'terrain/grass_02.png',
    'terrain/grass_03.png',
    'terrain/grass_04.png',
    'terrain/water_01.png',
    'terrain/water_02.png',
    'terrain/dirt_01.png',
    'vegetation/tree.png',
    'buildings/barn.png',
    'terrain/pond.png',
    'decoration/animal_pen.png',
    'terrain/farm_plot.png',
  ],

  /** Assets secundarios: cargar bajo demanda con loadWhenIdle(). */
  secondary: [] as string[],
} as const
