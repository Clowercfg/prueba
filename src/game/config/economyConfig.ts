/**
 * Configuración de economía de cultivos. Centralizada para poder balancear
 * precios sin tocar la lógica del juego.
 *
 * Valores por cultivo:
 * - seedPrice:    coste de la semilla (se descuenta del saldo al sembrar).
 * - growthHours:  horas hasta que el cultivo queda listo para cosechar.
 * - sellPrice:    precio de venta por unidad cosechada.
 * - profitPerUnit: ganancia bruta por unidad (sellPrice - seedPrice).
 */
export interface CropEconomyDef {
  name: string;
  seedPrice: number;
  growthHours: number;
  sellPrice: number;
  profitPerUnit: number;
}

export const CROP_ECONOMY: Record<string, CropEconomyDef> = {
  wheat: {
    name: "Trigo",
    seedPrice: 0.2,
    growthHours: 24,
    sellPrice: 0.204,
    profitPerUnit: 0.004,
  },
  carrot: {
    name: "Zanahoria",
    seedPrice: 0.2,
    growthHours: 48,
    sellPrice: 0.2049,
    profitPerUnit: 0.0049,
  },
  corn: {
    name: "Maíz",
    seedPrice: 0.3,
    growthHours: 36,
    sellPrice: 0.305,
    profitPerUnit: 0.005,
  },
  potato: {
    name: "Papa",
    seedPrice: 0.4,
    growthHours: 48,
    sellPrice: 0.41,
    profitPerUnit: 0.01,
  },
};

export function getCropEconomy(cropId: string): CropEconomyDef | null {
  return CROP_ECONOMY[cropId] ?? null;
}

/**
 * Economía de productos del Almacén (leche, huevos, miel, queso).
 * - name:      nombre mostrado.
 * - icon:      emoji del producto (textura/overlay).
 * - sellPrice: precio de venta por unidad.
 */
export interface GoodsEconomyDef {
  name: string;
  icon: string;
  sellPrice: number;
}

export const GOODS_ECONOMY: Record<string, GoodsEconomyDef> = {
  milk: { name: "Leche", icon: "🥛", sellPrice: 0.9 },
  eggs: { name: "Huevos", icon: "🥚", sellPrice: 0.05 },
  honey: { name: "Miel", icon: "🍯", sellPrice: 1.4 },
  cheese: { name: "Queso", icon: "🧀", sellPrice: 1.8 },
  "boiled-eggs": { name: "Huevos hervidos", icon: "🍳", sellPrice: 0.07 },
};

export function getGoodsEconomy(goodId: string): GoodsEconomyDef | null {
  return GOODS_ECONOMY[goodId] ?? null;
}

/**
 * Economía veterinaria. Todo configurable aquí:
 * - price:          precio de compra del animal (referencia, aún sin tienda).
 * - treatmentCost:  coste del tratamiento que paga el jugador al tratarlo.
 * - recoveryHours:  tiempo de recuperación tras el tratamiento (producción al 50%).
 *
 * Incluye especies futuras (Gallo/Cerdo): el sistema funciona para cualquier
 * especie que exista en el corral sin tocar esta lógica.
 */
export interface AnimalEconomyDef {
  name: string;
  icon: string;
  price: number;
  treatmentCost: number;
  recoveryHours: number;
  /** Descripción informativa de producción (se muestra en la tienda). */
  production: string;
  /** Coste de alimentación por periodo (día o ciclo de engorde). */
  feedCost: number;
  /** Periodo al que aplica el coste de alimentación. */
  feedPeriod: "día" | "ciclo";
}

export const ANIMAL_ECONOMY: Record<string, AnimalEconomyDef> = {
  chicken: { name: "Gallina", icon: "🐔", price: 10, treatmentCost: 0.4, recoveryHours: 6, production: "1 huevo cada 5 h", feedCost: 0.06, feedPeriod: "día" },
  rooster: { name: "Gallo", icon: "🐓", price: 35, treatmentCost: 1.25, recoveryHours: 6, production: "1 huevo fertilizado cada 24 h", feedCost: 0.08, feedPeriod: "día" },
  cow: { name: "Vaca", icon: "🐄", price: 50, treatmentCost: 2.5, recoveryHours: 12, production: "1 leche cada 8 h", feedCost: 0.15, feedPeriod: "día" },
  pig: { name: "Cerdo", icon: "🐖", price: 30, treatmentCost: 1.5, recoveryHours: 24, production: "Engorde 7 días · 60 kg de carne", feedCost: 0.03, feedPeriod: "ciclo" },
};

export function getAnimalEconomy(kind: string): AnimalEconomyDef | null {
  return ANIMAL_ECONOMY[kind] ?? null;
}

/**
 * Productos que la granja produce o procesa. Precio por unidad:
 * - egg:       huevo (producción de gallinas y gallos).
 * - milk:      leche (producción de vacas).
 * - meat:      carne (producción de cerdos).
 * - boiled-egg: huevo hervido (resultado de procesar un huevo).
 * El precio de VENTA de cada animal se obtiene desde aquí (nunca en la UI).
 */
export interface ProductEconomyDef {
  name: string;
  icon: string;
  price: number;
}

export const PRODUCT_ECONOMY: Record<string, ProductEconomyDef> = {
  egg: { name: "Huevo", icon: "🥚", price: 0.05 },
  milk: { name: "Leche", icon: "🥛", price: 2.4 },
  meat: { name: "Carne", icon: "🍖", price: 0.6 },
  "boiled-egg": { name: "Huevo hervido", icon: "🍳", price: 0.07 },
};

export function getProductEconomy(productId: string): ProductEconomyDef | null {
  return PRODUCT_ECONOMY[productId] ?? null;
}

/**
 * Precio de venta por unidad de producción de cada animal (referencia única,
 * usado por EconomySystem y la HUD). Coincide con los precios de producto.
 */
export const PRODUCTION_PRICE = {
  cow: PRODUCT_ECONOMY.milk.price,
  chicken: PRODUCT_ECONOMY.egg.price,
  rooster: PRODUCT_ECONOMY.egg.price,
  pig: PRODUCT_ECONOMY.meat.price,
} as const;

/**
 * Frecuencia de enfermedad. Granja de referencia = 20 animales.
 * - sickPerFarmDay:       ~1 animal enfermo cada 9 días (1/9 ≈ 0.1111 por día).
 * - referenceFarmSize:    animales de la granja de referencia (se reparte la tasa).
 * - minSickIntervalDays:  intervalo mínimo entre enfermedades del mismo animal (≥ 14 días).
 * - checkIntervalSeconds: cada cuánto se evalúa la probabilidad en tiempo real.
 */
export const SICKNESS_ECONOMY = {
  sickPerFarmDay: 1 / 9,
  referenceFarmSize: 20,
  minSickIntervalDays: 14,
  checkIntervalSeconds: 10,
};

/* ═══════════════════════════════════════════════════════════════════════════
   ⚡ PRECIOS DE ACELERACIÓN (diamantes por horas ahorradas)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AccelerationTier {
  label: string;
  hours: number;
  diamonds: number;
}

export const ACCELERATION_TIERS: AccelerationTier[] = [
  { label: "1h",       hours: 1,      diamonds: 12 },
  { label: "2h",       hours: 2,      diamonds: 22 },
  { label: "4h",       hours: 4,      diamonds: 40 },
  { label: "8h",       hours: 8,      diamonds: 70 },
  { label: "12h",      hours: 12,     diamonds: 95 },
  { label: "24h",      hours: 24,     diamonds: 165 },
  { label: "48h",      hours: 48,     diamonds: 290 },
  { label: "72h",      hours: 72,     diamonds: 390 },
  { label: "7d",       hours: 168,    diamonds: 750 },
  { label: "14d",      hours: 336,    diamonds: 1300 },
];
