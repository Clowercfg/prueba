/**
 * Hash determinista (xorshift/mulberry-like) para variantes de tile.
 * El mismo (i, j, seed) produce SIEMPRE el mismo resultado: sin Math.random().
 */
export function tileHash(i: number, j: number, seed = 0x9e3779b9): number {
  let h = (i * 374761393 + j * 668265263 + seed * 69069) | 0
  h ^= h >>> 13
  h = Math.imul(h, 1274126177)
  h ^= h >>> 16
  return h >>> 0
}

/** Variante determinista en [0, count). */
export function hashVariant(i: number, j: number, count: number, salt = 0): number {
  return count <= 1 ? 0 : tileHash(i, j, 0x9e3779b9 + salt) % count
}
