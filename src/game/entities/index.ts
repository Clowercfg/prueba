import type { FrameInfo } from '../types'

/**
 * Contrato base para futuras entidades (cultivos, animales, edificios...).
 * En esta fase no existen entidades de juego: solo el contrato.
 */
export interface GameEntity {
  readonly id: string
  update(frame: Pick<FrameInfo, 'delta' | 'elapsed'>): void
}

export type EntityList = readonly GameEntity[]
