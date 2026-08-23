import { TREE_SPOTS } from '../entities/farmEntities'

/**
 * Colisionadores de árboles para la IA de animales.
 *
 * WORLD SPACE ÚNICO: se derivan de los árboles REALMENTE dibujados en el mapa
 * (TREE_SPOTS de farmEntities, tiles 0..28). Ya no existe el scatter procedural
 * del mundo antiguo, que generaba colliders fantasma sin correspondencia visual.
 * Radio ≈ mitad del tronco en unidades de tile (la copa es transitable).
 */

export interface VegetationInstance {
  x: number;
  z: number;
  radius: number;
}

let cachedTrees: VegetationInstance[] | null = null;

export function getTreeColliders(): Array<{ x: number; z: number; radius: number }> {
  if (!cachedTrees) {
    cachedTrees = TREE_SPOTS.map(([i, j]) => ({ x: i + 0.5, z: j + 0.5, radius: 0.45 }));
  }
  return cachedTrees;
}
