/**
 * Configuración de OFERTAS / COMBOS de la tienda.
 *
 * Reglas:
 * - Los precios NUNCA se escriben aquí a mano: el precio normal se calcula
 *   sumando el coste de sus componentes (semillas y animales) tomando los
 *   precios de la economía central.
 * - El descuento máximo permitido es MAX_DISCOUNT (10%). Al comprar se
 *   vuelve a recortar el descuento (nunca puede superar el máximo aunque se
 *   edite el config).
 * - Precio oferta = precio normal × (1 − descuento efectivo).
 * - Ahorro = precio normal − precio oferta.
 */
import type { AnimalKind } from "../types/entities";
import { getCropEconomy, getAnimalEconomy } from "./economyConfig";

export const MAX_DISCOUNT = 0.1;

export type OfferItem =
  | { type: "seed"; cropId: string; qty: number }
  | { type: "animal"; kind: AnimalKind; qty: number };

export interface OfferDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Descuento sobre el precio normal (0.1 = 10%). Se recorta al máximo. */
  discount: number;
  items: OfferItem[];
}

export const OFFERS: OfferDef[] = [
  {
    id: "seedpack",
    name: "Lote de Semillas",
    icon: "🌾",
    description: "Trigo + Maíz + Zanahoria + Papa, 100 de cada.",
    discount: 0.1,
    items: [
      { type: "seed", cropId: "wheat", qty: 100 },
      { type: "seed", cropId: "corn", qty: 100 },
      { type: "seed", cropId: "carrot", qty: 100 },
      { type: "seed", cropId: "potato", qty: 100 },
    ],
  },
  {
    id: "beginner",
    name: "Combo Principiante",
    icon: "🌱",
    description: "Semillas para arrancar y un par de gallinas.",
    discount: 0.1,
    items: [
      { type: "seed", cropId: "wheat", qty: 20 },
      { type: "seed", cropId: "carrot", qty: 10 },
      { type: "animal", kind: "chicken", qty: 2 },
    ],
  },
  {
    id: "farmer",
    name: "Combo Agricultor",
    icon: "🥕",
    description: "Cultivos variados y tu primera vaca.",
    discount: 0.1,
    items: [
      { type: "seed", cropId: "wheat", qty: 30 },
      { type: "seed", cropId: "carrot", qty: 20 },
      { type: "seed", cropId: "potato", qty: 10 },
      { type: "animal", kind: "cow", qty: 1 },
    ],
  },
  {
    id: "poultry",
    name: "Combo Gallinero",
    icon: "🐔",
    description: "Aves de corral para producción de huevos.",
    discount: 0.1,
    items: [
      { type: "animal", kind: "chicken", qty: 5 },
      { type: "animal", kind: "rooster", qty: 2 },
      { type: "seed", cropId: "wheat", qty: 20 },
    ],
  },
  {
    id: "dairy",
    name: "Combo Lechero",
    icon: "🐄",
    description: "Vacas lecheras y forraje de zanahoria.",
    discount: 0.1,
    items: [
      { type: "animal", kind: "cow", qty: 3 },
      { type: "seed", cropId: "carrot", qty: 20 },
    ],
  },
  {
    id: "swine",
    name: "Combo Porcicultor",
    icon: "🐖",
    description: "Cerdos de engorde para producción de carne.",
    discount: 0.1,
    items: [
      { type: "animal", kind: "pig", qty: 4 },
      { type: "seed", cropId: "potato", qty: 10 },
    ],
  },
  {
    id: "repro",
    name: "Combo Reproducción",
    icon: "🐣",
    description: "Gallos y gallinas listos para la incubadora.",
    discount: 0.1,
    items: [
      { type: "animal", kind: "rooster", qty: 2 },
      { type: "animal", kind: "chicken", qty: 6 },
      { type: "seed", cropId: "wheat", qty: 10 },
    ],
  },
  {
    id: "granjero",
    name: "Granjero $300",
    icon: "💰",
    description: "Gran lote de semillas y ganado para crecer de golpe.",
    discount: 0.1,
    items: [
      { type: "seed", cropId: "wheat", qty: 150 },
      { type: "seed", cropId: "carrot", qty: 100 },
      { type: "seed", cropId: "potato", qty: 80 },
      { type: "animal", kind: "cow", qty: 4 },
      { type: "animal", kind: "chicken", qty: 2 },
    ],
  },
  {
    id: "advanced",
    name: "Granja Avanzada",
    icon: "💎",
    description: "Ganado variado y semillas premium para granjas en marcha.",
    discount: 0.1,
    items: [
      { type: "animal", kind: "cow", qty: 5 },
      { type: "animal", kind: "chicken", qty: 10 },
      { type: "animal", kind: "rooster", qty: 4 },
      { type: "seed", cropId: "wheat", qty: 50 },
      { type: "seed", cropId: "potato", qty: 50 },
    ],
  },
  {
    id: "mega",
    name: "Mega Granja",
    icon: "🔥",
    description: "El paquete definitivo: mucho ganado y toneladas de semillas.",
    discount: 0.1,
    items: [
      { type: "animal", kind: "cow", qty: 10 },
      { type: "animal", kind: "chicken", qty: 20 },
      { type: "animal", kind: "rooster", qty: 8 },
      { type: "animal", kind: "pig", qty: 6 },
      { type: "seed", cropId: "wheat", qty: 100 },
      { type: "seed", cropId: "carrot", qty: 100 },
      { type: "seed", cropId: "potato", qty: 100 },
    ],
  },
];

export const OFFER_LIST: OfferDef[] = OFFERS;

export function getOffer(id: string): OfferDef | null {
  return OFFERS.find((o) => o.id === id) ?? null;
}

/** Descuento efectivo: nunca por encima de MAX_DISCOUNT. */
export function effectiveDiscount(def: OfferDef): number {
  return Math.min(MAX_DISCOUNT, Math.max(0, def.discount));
}

/** Precio normal = suma del coste de los componentes (economía central). */
export function offerNormalPrice(def: OfferDef): number {
  let total = 0;
  for (const item of def.items) {
    if (item.type === "seed") {
      total += (getCropEconomy(item.cropId)?.seedPrice ?? 0) * item.qty;
    } else {
      total += (getAnimalEconomy(item.kind)?.price ?? 0) * item.qty;
    }
  }
  return total;
}

/** Precio de oferta = normal × (1 − descuento efectivo). */
export function offerSalePrice(def: OfferDef): number {
  return offerNormalPrice(def) * (1 - effectiveDiscount(def));
}

/** Ahorro respecto al precio normal. */
export function offerSavings(def: OfferDef): number {
  return offerNormalPrice(def) - offerSalePrice(def);
}
