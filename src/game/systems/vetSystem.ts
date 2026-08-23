import { animalRegistry } from '../stores/farmStore'
import { useVetStore } from '../stores/vetStore'
import { SICKNESS_ECONOMY } from '../config/economyConfig'

/**
 * Sistema veterinario migrado del proyecto anterior
 * (systems/veterinary/VetSystem.tsx).
 * La versión original era un componente React con un setInterval de
 * SICKNESS_ECONOMY.checkIntervalSeconds que: daba de alta a los animales que
 * terminaron su recuperación y lanzaba el rollo probabilístico de enfermedad
 * respetando el intervalo mínimo entre enfermedades. Mismo gate de pausa,
 * sin dependencias de React ni del worldStore pendiente de migrar.
 */

const DAY_MS = 86_400_000

/** Gate de pausa (equivalente a worldStore.paused del proyecto anterior). */
let paused = false

export function setVetPaused(value: boolean): void {
  paused = value
}

export function isVetPaused(): boolean {
  return paused
}

/** Un tick del sistema: altas médicas + rollo de enfermedad. */
export function tickVetSystem(): void {
  if (paused) return
  const now = Date.now()
  const vet = useVetStore.getState()

  // Los animales tratados terminan su recuperación y vuelven a estar sanos.
  for (const id of Object.keys(vet.sick)) {
    const entry = vet.sick[Number(id)]
    if (entry.recoverAt !== null && now >= entry.recoverAt) {
      vet.markRecovered(entry.id)
    }
  }

  // Probabilidad de enfermedad: tasa por animal/día repartida en la granja de
  // referencia; cada animal respeta su intervalo mínimo.
  const dtDays = (now - (vet.lastCheckAt || now)) / DAY_MS
  useVetStore.setState({ lastCheckAt: now })
  const perAnimalPerDay =
    SICKNESS_ECONOMY.sickPerFarmDay / SICKNESS_ECONOMY.referenceFarmSize

  for (const a of animalRegistry.values()) {
    if (vet.sick[a.id]) continue
    const nextSick = vet.nextSickAt[a.id] ?? now + Math.random() * SICKNESS_ECONOMY.minSickIntervalDays * DAY_MS
    if (now < nextSick) continue
    if (Math.random() < perAnimalPerDay * dtDays) {
      vet.makeSick(a.id, a.kind)
      useVetStore.setState((s) => ({
        nextSickAt: { ...s.nextSickAt, [a.id]: now + SICKNESS_ECONOMY.minSickIntervalDays * DAY_MS },
      }))
    }
  }
}

/**
 * Arranca el ciclo veterinario (intervalo por configuración, igual que el
 * original). Devuelve la función de parada para el cleanup del montaje.
 */
export function startVetSystem(intervalMs = SICKNESS_ECONOMY.checkIntervalSeconds * 1000): () => void {
  const iv = setInterval(tickVetSystem, intervalMs)
  return () => clearInterval(iv)
}
