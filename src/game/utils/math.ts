export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, z: number, seed = 7): number {
  let h = seed ^ (x * 374761393) ^ (z * 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function makeRng(seed: number): () => number {
  return mulberry32(seed);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}

export function angLerp(a: number, b: number, t: number): number {
  let d = b - a;
  d = ((d + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function randomPointInCircle(r: number, rng: () => number): [number, number] {
  const a = rng() * Math.PI * 2;
  const rr = Math.sqrt(rng()) * r;
  return [Math.cos(a) * rr, Math.sin(a) * rr];
}

export function randomPointInRing(rMin: number, rMax: number, rng: () => number): [number, number] {
  const a = rng() * Math.PI * 2;
  const rr = rMin + rng() * (rMax - rMin);
  return [Math.cos(a) * rr, Math.sin(a) * rr];
}

export function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}
