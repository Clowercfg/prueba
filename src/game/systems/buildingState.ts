import type { AnimalKind } from "../types/entities";
import type { OfferItem } from "../config/offersConfig";
import { STATIC_BUILDINGS, type StaticBuilding } from "../config/buildingsLayout";
import { ENCLOSURES } from "../config/enclosuresConfig";
import { useUpgradesStore } from "../stores/upgradesStore";
import { useFarmStore } from "../stores/farmStore";
import { useLanguageStore } from "../stores/languageStore";

/**
 * Estado y lógica de edificios/corrales del proyecto anterior.
 *
 * En el original no existe un store dedicado: los edificios son estáticos
 * (buildingsLayout), la progresión son los NIVELES de mejora (upgradesStore,
 * ya migrado) y la lógica de capacidad de corrales vivía dentro de shopStore.
 * Este módulo extrae esa parte pura (edificios/corralos) sin arrastrar las
 * compras de la tienda (economía, fase futura).
 */

/** Traducción global (el idioma se lee en el momento de la llamada). */
function tr(key: string, params?: Record<string, string | number>): string {
  return useLanguageStore.getState().t(key, params);
}

export interface BuildingCheckResult {
  ok: boolean;
  message: string;
  detail?: string;
}

/** Edificio de mejoras que aloja cada especie (gallinero/establo/pocilga). */
export const BUILDING_OF_KIND: Record<AnimalKind, string> = {
  cow: "stable",
  chicken: "coop",
  rooster: "coop",
  pig: "pigPen",
};

/** Capacidad del edificio que aloja la especie y animales que ya lo ocupan. */
export function capacityFor(kind: AnimalKind): { building: string; capacity: number; used: number } {
  const building = BUILDING_OF_KIND[kind];
  const capacity = useUpgradesStore.getState().capacityOf(building);
  const used = useFarmStore
    .getState()
    .animals.filter((a) => BUILDING_OF_KIND[a.kind] === building).length;
  return { building, capacity, used };
}

function noCapacity(building: string, capacity: number, needed: number): BuildingCheckResult {
  return {
    ok: false,
    message: tr("shop.capacity"),
    detail: tr("shop.capacity_detail", {
      free: capacity - needed < 0 ? 0 : capacity - needed,
      building: tr(`building.${building}`),
    }),
  };
}

/** Comprueba que los animales de un combo quepan en sus edificios. */
export function validateAnimalCapacity(items: readonly OfferItem[]): BuildingCheckResult | null {
  const neededByBuilding: Record<string, number> = {};
  for (const item of items) {
    if (item.type !== "animal" || item.qty <= 0) continue;
    const { building } = capacityFor(item.kind);
    neededByBuilding[building] = (neededByBuilding[building] ?? 0) + item.qty;
  }
  for (const [building, needed] of Object.entries(neededByBuilding)) {
    const anyKind = (Object.keys(BUILDING_OF_KIND) as AnimalKind[]).find(
      (k) => BUILDING_OF_KIND[k] === building
    );
    if (!anyKind) continue;
    const cap = capacityFor(anyKind);
    if (cap.used + needed > cap.capacity) {
      return noCapacity(building, cap.capacity, needed);
    }
  }
  return null;
}

/** Edificio de mejoras asociado a cada tipo estático (null si no tiene).
 *  Nota: pigPen no es un edificio estático; los cerdos habitan su cercado
 *  (enclosuresConfig) y su capacidad vive solo en upgradesStore. */
export const UPGRADE_OF_TYPE: Record<StaticBuilding["type"], string | null> = {
  barn: "granary",
  cowPen: "stable",
  chickenPen: "coop",
  house: null,
  workshop: null,
  warehouse: null,
  greenhouse: null,
};

/**
 * Snapshot de estado de edificios: posiciones reales del layout estático más
 * el nivel de mejora actual cuando el edificio participa en la economía de
 * mejoras. Pensado para UI/renderer; no muta nada.
 */
export function listBuildingsState(): Array<{
  uid: string;
  type: StaticBuilding["type"];
  position: [number, number, number];
  rotation: number;
  level: number;
  upgradeId: string | null;
  upgradeLevel: number | null;
}> {
  const upgrades = useUpgradesStore.getState();
  return STATIC_BUILDINGS.map((b) => {
    const upgradeId = UPGRADE_OF_TYPE[b.type];
    return {
      uid: b.uid,
      type: b.type,
      position: [...b.position] as [number, number, number],
      rotation: b.rotation,
      level: b.level,
      upgradeId,
      upgradeLevel: upgradeId ? (upgrades.levels[upgradeId] ?? null) : null,
    };
  });
}

/** Ocupación por corral: capacidad base de configuración vs animales registrados. */
export function enclosureOccupancy(): Array<{
  id: string;
  kind: AnimalKind;
  baseCapacity: number;
  building: string;
  buildingCapacity: number;
  used: number;
}> {
  return ENCLOSURES.map((e) => {
    const cap = capacityFor(e.kind);
    return {
      id: e.id,
      kind: e.kind,
      baseCapacity: e.capacity,
      building: cap.building,
      buildingCapacity: cap.capacity,
      used: cap.used,
    };
  });
}
