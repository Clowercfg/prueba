import type { AnimalView } from "../../renderer/canvas2d/scene/animals";
import type { AnimalKind } from "../types/entities";
import { animalRegistry } from "../stores/farmStore";

/**
 * Adaptador registry → renderer (ComposerHooks.getAnimals).
 *
 * WORLD SPACE ÚNICO: desde la unificación de coordenadas, AnimalAgent.position
 * ES la posición del mundo y se copia TAL CUAL a la vista (sin remapeos). Este
 * módulo solo traduce semántica agente→sprite:
 *   - especie visual (rooster comparte arte de gallina)
 *   - estado lógico → animación (wander/eating/rest → walk/graze/peck/idle)
 *   - facing según componente X de la velocidad
 *
 * Rendimiento: cache por id con objetos mutados in-place → cero allocs por
 * frame salvo altas/bajas reales del registry.
 */

const viewCache = new Map<number, AnimalView>();
const out: AnimalView[] = [];

export function collectAnimalViews(): readonly AnimalView[] {
  out.length = 0;
  for (const a of animalRegistry.values()) {
    let view = viewCache.get(a.id);
    if (!view) {
      view = {
        id: String(a.id),
        species: "chicken",
        x: a.position[0],
        y: a.position[2],
        facing: 1,
        state: "idle",
      };
      viewCache.set(a.id, view);
    }
    view.species = speciesOf(a.kind);
    view.x = a.position[0];
    view.y = a.position[2];
    if (Math.abs(a.velocity[0]) > 0.05) view.facing = a.velocity[0] > 0 ? 1 : -1;
    view.state =
      a.state === "wander"
        ? "walk"
        : a.state === "eating"
          ? a.kind === "cow"
            ? "graze"
            : "peck"
          : "idle";
    out.push(view);
  }
  // Purga de vistas huérfanas (animal eliminado del registry).
  if (viewCache.size !== out.length) {
    const alive = new Set(out.map((v) => v.id));
    for (const id of [...viewCache.keys()]) {
      if (!alive.has(String(id))) viewCache.delete(id);
    }
  }
  return out;
}

function speciesOf(kind: AnimalKind): "cow" | "chicken" | "pig" {
  return kind === "cow" ? "cow" : kind === "pig" ? "pig" : "chicken";
}
