import type { AnimalView } from "../../renderer/canvas2d/scene/animals";
import { ENCLOSURE_BY_KIND } from "../config/enclosuresConfig";
import type { AnimalKind } from "../types/entities";
import { animalRegistry } from "../stores/farmStore";

/**
 * Puente de PRESENTACIÓN registry → renderer (ComposerHooks.getAnimals).
 *
 * Los agentes de AnimalAI viven en las coordenadas del mundo lógico
 * (bounds de enclosuresConfig, herencia del port) mientras que el mapa
 * iso actual usa tiles pequeños: este módulo remapea la posición relativa
 * de cada agente dentro de su corral a un rectángulo visual del mapa.
 * Es un transform puro de presentación: no muta agentes ni IA. Cuando los
 * mundos se unifiquen, basta con devolver position directamente.
 */

interface VisualRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const VISUAL_RECT: Record<AnimalKind, VisualRect> = {
  // Pradera junto al granero (entre casa y parcelas).
  cow: { minX: 13.2, maxX: 17.6, minY: 9.2, maxY: 14.2 },
  // Corral de aves con valla dibujada.
  chicken: { minX: 18.7, maxX: 22.3, minY: 22.6, maxY: 25.7 },
  rooster: { minX: 18.7, maxX: 22.3, minY: 22.6, maxY: 25.7 },
  // Descampado al sur del corral de aves.
  pig: { minX: 15.0, maxX: 18.0, minY: 15.4, maxY: 19.4 },
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Cache por id: cero objetos nuevos por frame salvo altas/bajas reales. */
const viewCache = new Map<number, AnimalView>();
const out: AnimalView[] = [];

export function collectAnimalViews(): readonly AnimalView[] {
  out.length = 0;
  for (const a of animalRegistry.values()) {
    const enc = ENCLOSURE_BY_KIND[a.kind];
    const rect = VISUAL_RECT[a.kind];
    let view = viewCache.get(a.id);
    if (!view) {
      view = {
        id: String(a.id),
        species: "chicken",
        x: rect.minX,
        y: rect.minY,
        facing: 1,
        state: "idle",
      };
      viewCache.set(a.id, view);
    }
    const u = clamp01(
      (a.position[0] - enc.bounds.minX) / (enc.bounds.maxX - enc.bounds.minX),
    );
    const t = clamp01(
      (a.position[2] - enc.bounds.minZ) / (enc.bounds.maxZ - enc.bounds.minZ),
    );
    view.species =
      a.kind === "cow" ? "cow" : a.kind === "pig" ? "pig" : "chicken";
    view.x = rect.minX + u * (rect.maxX - rect.minX);
    view.y = rect.minY + t * (rect.maxY - rect.minY);
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
