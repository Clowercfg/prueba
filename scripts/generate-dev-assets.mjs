/**
 * Generador de sprites dev para Harvest Valley (PNG 64×64, rombo con alpha).
 * Sin dependencias: usa node:zlib para el IDAT. Determinista (LCG con seed fija).
 *
 * Uso: npm run assets:generate
 * NOTA: son placeholders de desarrollo, NO arte final. En producción se
 * sustituirán por WebP con transparencia en las mismas rutas.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/assets/2d')
const SIZE = 64
const HALF_W = SIZE / 2 // 32
const HALF_H = SIZE / 4 // 16

// ---------------------------------------------------------------------------
// PNG mínimo: firma + IHDR + IDAT + IEND
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filtro none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// Dibujo determinista (LCG con seed fija — nada de Math.random)
// ---------------------------------------------------------------------------
function lcg(seed) {
  let s = seed | 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0), ((s >>> 8) & 0xffff) / 65536)
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0
}

/** Pinta un rombo con borde, sombreado vertical y motas; fuera del rombo → alpha 0. */
function diamondTile({ baseHex, edgeHex, speckHex, seed }) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4)
  const [br, bg, bb] = hexToRgb(baseHex)
  const [er, eg, eb] = hexToRgb(edgeHex)
  const [sr, sg, sb] = hexToRgb(speckHex)
  const rnd = lcg(seed)

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.abs(x - HALF_W) / HALF_W + Math.abs(y - HALF_H) / HALF_H
      if (d > 1) continue // transparente

      const i = (y * SIZE + x) * 4
      const shade = 1 - ((y / SIZE) * 2 - 1) * 0.08 // más oscuro arriba, claro abajo
      let r = br * shade
      let g = bg * shade
      let b = bb * shade

      if (d > 0.9) {
        r = er
        g = eg
        b = eb // borde
      } else if (rnd() < 0.055) {
        r = sr
        g = sg
        b = sb // mota determinista
      }

      rgba[i] = clamp255(r)
      rgba[i + 1] = clamp255(g)
      rgba[i + 2] = clamp255(b)
      rgba[i + 3] = d > 0.96 ? 128 : 255 // borde suave
    }
  }
  return rgba
}

function waterTile(variant) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4)
  const rnd = lcg(100 + variant * 7)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = Math.abs(x - HALF_W) / HALF_W + Math.abs(y - HALF_H) / HALF_H
      if (d > 1) continue
      const i = (y * SIZE + x) * 4
      const wave = Math.sin((y + variant * 3) * 0.55 + Math.sin(x * 0.18)) > 0.82
      const shade = 1 - ((y / SIZE) * 2 - 1) * 0.06
      rgba[i] = clamp255(wave ? 150 * shade : 63 * shade)
      rgba[i + 1] = clamp255(wave ? 200 * shade : 127 * shade)
      rgba[i + 2] = clamp255(wave ? 235 * shade : 181 * shade)
      if (!wave && rnd() < 0.02) rgba[i + 2] = clamp255(rgba[i + 2] + 40)
      rgba[i + 3] = d > 0.96 ? 140 : 255
    }
  }
  return rgba
}

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------
function save(relPath, buffer) {
  const dest = resolve(OUT, relPath)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, buffer)
}

const GRASS = [
  { baseHex: '#7ab654', edgeHex: '#5d9440', speckHex: '#4f8a38', seed: 11 },
  { baseHex: '#72ac4d', edgeHex: '#578c3b', speckHex: '#498034', seed: 23 },
  { baseHex: '#82bf5f', edgeHex: '#659a49', speckHex: '#57913f', seed: 37 },
  { baseHex: '#70a54a', edgeHex: '#558a38', speckHex: '#477e30', seed: 51 },
]

// dirt_01 NO va en la lista de críticos: sirve para probar carga bajo demanda.
const files = []
GRASS.forEach((p, i) => {
  const name = `terrain/grass_0${i + 1}.png`
  save(name, encodePng(SIZE, SIZE, diamondTile(p)))
  files.push(name)
})

save(
  'terrain/dirt_01.png',
  encodePng(
    SIZE,
    SIZE,
    diamondTile({ baseHex: '#9b7653', edgeHex: '#7c5c40', speckHex: '#6e5238', seed: 77 }),
  ),
)
files.push('terrain/dirt_01.png')

for (const v of [1, 2]) {
  const name = `terrain/water_0${v}.png`
  save(name, encodePng(SIZE, SIZE, waterTile(v)))
  files.push(name)
}

// Estructura completa de carpetas (vacías por ahora, .gitkeep para git)
for (const dir of ['buildings', 'animals', 'crops', 'vegetation', 'decoration', 'ui', 'effects']) {
  mkdirSync(resolve(OUT, dir), { recursive: true })
  writeFileSync(resolve(OUT, dir, '.gitkeep'), '')
}

console.log(`Generados ${files.length} sprites dev:`)
for (const f of files) console.log('  public/assets/2d/' + f)
