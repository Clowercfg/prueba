/**
 * Paleta única del mundo Harvest Valley.
 * TODOS los pintores (terreno, flora, edificios, ambiente) toman sus colores
 * de aquí para compartir la misma luz, saturación y temperatura.
 */

export const PAL = {
  /** Pradera continua que extiende el terreno más allá de la granja (#25). */
  meadow: {
    hi: '#84c565',
    lo: '#619e4b',
    blobLight: 'rgba(255,255,214,0.10)',
    blobDark: 'rgba(28,84,44,0.13)',
  },

  lake: {
    hi: '#9bd8ec',
    lo: '#4e9cc6',
    deep: '#3d87b3',
    wave: 'rgba(255,255,255,0.30)',
    islandShadow: '#22638a',
  },

  coast: {
    sand: '#ecdca2',
    sandDeep: '#dcc98d',
    cliff: '#54613c',
    cliffDark: '#414d2e',
  },

  grass: {
    tones: ['#7fc25f', '#77b957', '#86c967', '#72b251'],
    forestFloor: ['#5da24a', '#569844', '#639f50', '#529040'],
    meadowLight: 'rgba(255,255,214,0.07)',
    meadowDark: 'rgba(28,84,44,0.08)',
    tuftDark: 'rgba(38,92,48,0.55)',
    tuftLight: 'rgba(210,240,160,0.65)',
  },

  path: {
    fill: '#d9bc8e',
    fillWarm: '#cfb183',
    stone: '#b3a186',
    stoneDark: '#8f8069',
  },

  dirt: {
    yard: '#c8a271',
    straw: 'rgba(238,206,138,0.75)',
    pebble: '#a89274',
  },

  soil: {
    dark: '#5e4130',
    furrow: '#74543c',
    weed: '#69ad4b',
  },

  water: {
    base: '#4e9bc9',
    deep: '#3f87b5',
    shallow: '#66aed2',
    rim: 'rgba(213,242,248,0.50)',
    rimDark: 'rgba(24,70,105,0.18)',
    lily: '#4e9e4a',
    lilyLit: '#7fc069',
    reedStem: '#5d8a3c',
    reedHead: '#7a4b26',
  },

  flora: {
    trunkLit: '#8a5b36',
    trunkShade: '#6b4526',
    oakMid: '#58a94c',
    oakShade: '#3f8a3f',
    oakLit: '#79c45f',
    oakSpark: '#9ad673',
    pineMid: '#3e8e56',
    pineShade: '#2f7345',
    pineLit: '#52a668',
    bushBerries: '#e0524a',
    rockLit: '#aaa49b',
    rockShade: '#7e786f',
    rockMoss: '#6fa84e',
  },

  barn: {
    wallLit: '#ce5347',
    wallShade: '#a63e35',
    trim: '#f7ebd3',
    roofLitLo: '#8aa3b8',
    roofLitHi: '#7a93aa',
    roofEdge: '#5d7386',
    doorPlank: '#7a4e2e',
    doorDark: '#5f3b22',
    loft: '#43301f',
    stoneFound: '#a09689',
    stoneFoundShade: '#7e756b',
    iron: '#4a4038',
  },

  pen: {
    woodLit: '#c08a54',
    woodMid: '#a97a49',
    woodShade: '#8b6038',
    trough: '#6e4c2c',
  },

  house: {
    wallLit: '#f6e9c8',
    wallShade: '#dcc79e',
    trim: '#fbf3dd',
    roofLitLo: '#cf7a52',
    roofLitHi: '#e2926a',
    roofEdge: '#a05a3c',
    door: '#7a4e2e',
    doorDark: '#5f3b22',
    stoneFound: '#a09689',
    stoneFoundShade: '#7e756b',
    chimney: '#8f8578',
    chimneyDark: '#6f665c',
  },

  flowers: {
    petals: ['#fff7ea', '#ffd35c', '#ff9db4', '#ffffff'],
    center: '#f5a623',
  },

  shadowInk: 'rgba(36,62,48,1)',
} as const

const hexCache = new Map<string, [number, number, number]>()

function parseHex(hex: string): [number, number, number] {
  const cached = hexCache.get(hex)
  if (cached) return cached
  const n = parseInt(hex.slice(1), 16)
  const rgb: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  hexCache.set(hex, rgb)
  return rgb
}

/** Mezcla un color hex hacia blanco (amt > 0) o negro (amt < 0). amt en [-1, 1]. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = parseHex(hex)
  if (amt >= 0) {
    const f = (v: number): number => Math.round(v + (255 - v) * amt)
    return `rgb(${f(r)},${f(g)},${f(b)})`
  }
  const f = (v: number): number => Math.round(v * (1 + amt))
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

/** Color con alpha a partir de hex. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r},${g},${b},${alpha})`
}
