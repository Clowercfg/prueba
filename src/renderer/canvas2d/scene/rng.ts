/**
 * Hash determinista y ruido de valor para variación orgánica del terreno.
 * Mismo input → mismo output SIEMPRE (sin Math.random()): la granja es
 * reproducible frame a frame y entre sesiones.
 */

export function hash2(i: number, j: number, salt = 0x9e3779b9): number {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(salt | 0, 69069)) | 0
  h ^= h >>> 13
  h = Math.imul(h, 1274126177)
  h ^= h >>> 16
  return h >>> 0
}

/** Hash normalizado a [0, 1). Acepta coordenadas fraccionarias. */
export function unit(x: number, y: number, salt = 0): number {
  const xi = Math.floor(x * 4096)
  const yi = Math.floor(y * 4096)
  return hash2(xi, yi, salt) / 4294967296
}

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Ruido de valor bilinear suavizado en [0,1]. Escala ~1 unidad por celda. */
export function valueNoise(x: number, y: number, salt = 0): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smootherstep(x - x0)
  const fy = smootherstep(y - y0)
  const n00 = hash2(x0, y0, salt) / 4294967296
  const n10 = hash2(x0 + 1, y0, salt) / 4294967296
  const n01 = hash2(x0, y0 + 1, salt) / 4294967296
  const n11 = hash2(x0 + 1, y0 + 1, salt) / 4294967296
  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy)
}

/** Ruido fractal (2 octavas) en [0,1]: manchas grandes + detalle medio. */
export function fbm(x: number, y: number, salt = 0): number {
  const lo = valueNoise(x * 0.16, y * 0.16, salt)
  const hi = valueNoise(x * 0.45 + 13.7, y * 0.45 + 91.2, salt + 101)
  return lo * 0.72 + hi * 0.28
}
