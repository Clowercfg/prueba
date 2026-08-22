export type SpriteStatus = 'idle' | 'loading' | 'loaded' | 'failed'

export interface SpriteStats {
  readonly loaded: number
  readonly failed: number
  readonly loading: number
  /** Image elements creados en toda la sesión (invariante: nunca > claves únicas). */
  readonly imageCreations: number
}

interface InflightEntry {
  promise: Promise<HTMLImageElement | null>
}

/**
 * Caché central de sprites 2.5D.
 *
 * - `cache: Map<string, HTMLImageElement>` — una sola imagen por clave, para siempre.
 * - `pending` deduplica descargas concurrentes: la segunda llamada reutiliza la promesa.
 * - `get()` es sincrónico y NO crea nada: null = "aún no está, dibuja tu fallback".
 * - Un asset faltante NUNCA lanza error ni rechaza: resuelve `null` y el juego sigue.
 *
 * Flujo progresivo obligatorio: el juego arranca sin esperar assets; los críticos
 * se precargan después del primer frame y los secundarios bajo demanda.
 */
export class SpriteAssetManager {
  private readonly cache = new Map<string, HTMLImageElement>()
  private readonly pending = new Map<string, InflightEntry>()
  private readonly statuses = new Map<string, SpriteStatus>()
  private imageCreations = 0

  constructor(private readonly baseUrl: string) {}

  getStatus(key: string): SpriteStatus {
    return this.statuses.get(key) ?? 'idle'
  }

  isLoaded(key: string): boolean {
    return this.cache.has(key)
  }

  /** Sincrónico y sin efectos: devuelve la imagen cacheada o null. */
  get(key: string): HTMLImageElement | null {
    return this.cache.get(key) ?? null
  }

  /**
   * Carga con dedupe: si ya está cargada resuelve al instante; si hay una
   * descarga en curso devuelve LA MISMA promesa (una única petición de red).
   * Resuelve `null` si el asset no existe o falla (fallback del renderer).
   */
  load(key: string): Promise<HTMLImageElement | null> {
    const cached = this.cache.get(key)
    if (cached) return Promise.resolve(cached)

    const inflight = this.pending.get(key)
    if (inflight) return inflight.promise

    this.statuses.set(key, 'loading')
    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image()
      this.imageCreations++
      img.decoding = 'async'
      img.onload = () => {
        this.cache.set(key, img)
        this.statuses.set(key, 'loaded')
        this.pending.delete(key)
        resolve(img)
      }
      img.onerror = () => {
        // Fallback: sin excepciones, sin romper el renderer.
        this.statuses.set(key, 'failed')
        this.pending.delete(key)
        resolve(null)
      }
      img.src = this.baseUrl + key
    })

    this.pending.set(key, { promise })
    return promise
  }

  /**
   * Precarga de assets críticos. LLAMAR SOLO DESPUÉS del primer render:
   * aquí sí usamos Promise.all, pero nunca antes del primer draw.
   */
  async preload(keys: readonly string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.load(k)))
  }

  /** Carga secundaria fire-and-forget (bajo demanda / idle). */
  loadWhenIdle(key: string): void {
    void this.load(key).catch(() => {})
  }

  stats(): SpriteStats {
    return {
      loaded: [...this.statuses.values()].filter((s) => s === 'loaded').length,
      failed: [...this.statuses.values()].filter((s) => s === 'failed').length,
      loading: this.pending.size,
      imageCreations: this.imageCreations,
    }
  }
}
