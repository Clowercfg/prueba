/**
 * SISTEMA DE COMPRA DE LA TIENDA.
 *
 * Lógica económica separada de la interfaz: aquí se validan saldo, capacidad
 * y se ejecutan las compras reales (descontar dinero, crear animales, añadir
 * semillas). La UI de la tienda solo llama a estas funciones y muestra
 * resultados; nunca decide precios ni cantidades.
 *
 * Seguridad:
 * - Los precios se resuelven desde la economía central (nunca del cliente).
 * - Las compras de combos recalculan el descuento y lo recortan al máximo
 *   permitido (10%): un descuento manipulado nunca supera el límite.
 * - Cantidades negativas, fraccionarias o cero se rechazan.
 */
import { create } from "zustand";
import type { AnimalKind } from "../types/entities";
import { getCropEconomy, getAnimalEconomy } from "../config/economyConfig";
import {
  getOffer,
  offerNormalPrice,
  offerSalePrice,
  effectiveDiscount,
} from "../config/offersConfig";
import { useEconomyStore } from "./economyStore";
import { useAuthStore } from "./authStore";
import { useWalletStore } from "./walletStore";
import { useFarmStore } from "./farmStore";
import { useCropStore } from "./cropStore";
import { useLanguageStore } from "./languageStore";
import { useGoodsStore } from "./goodsStore";
import { createAnimalAgent } from "../utils/animalSpawn";
import {
  capacityFor,
  validateAnimalCapacity,
  noCapacity,
} from "../systems/buildingState";

export interface ShopResult {
  ok: boolean;
  message: string;
  detail?: string;
  /** Nombre corto del producto para la animación de compra (fx). */
  fxLabel?: string;
}

/** Traducción global (el idioma se lee en el momento de la llamada). */
function tr(key: string, params?: Record<string, string | number>): string {
  return useLanguageStore.getState().t(key, params);
}

const KIND_NAME: Record<AnimalKind, string> = {
  cow: "VACA",
  chicken: "GALLINA",
  rooster: "GALLO",
  pig: "CERDO",
};

const counters: Record<AnimalKind, number> = { cow: 0, chicken: 0, rooster: 0, pig: 0 };

function animalName(kind: AnimalKind): string {
  counters[kind] += 1;
  return `${KIND_NAME[kind]} #${String(counters[kind]).padStart(3, "0")}`;
}

function invalidQty(qty: number): boolean {
  return !Number.isFinite(qty) || Math.floor(qty) !== qty || qty <= 0;
}

function insufficient(cost: number, have?: number): ShopResult {
  const available = have ?? useEconomyStore.getState().gold;
  return {
    ok: false,
    message: tr("shop.insufficient"),
    detail: tr("shop.insufficient_detail", {
      need: `$${cost.toFixed(2)}`,
      have: `$${available.toFixed(2)}`,
    }),
  };
}

interface ShopStore {
  buySeed: (cropId: string, qty: number) => Promise<ShopResult>;
  buyAnimal: (kind: AnimalKind, qty: number) => Promise<ShopResult>;
  buyCombo: (comboId: string) => Promise<ShopResult>;
}

export const useShopStore = create<ShopStore>((_set, _get) => ({
  buySeed: async (cropId, qty) => {
    if (invalidQty(qty)) {
      return { ok: false, message: tr("shop.invalid_qty"), detail: tr("shop.invalid_qty_detail") };
    }
    const def = getCropEconomy(cropId);
    if (!def) return { ok: false, message: tr("shop.unavailable") };
    const err = await useCropStore.getState().buySeed(cropId, qty);
    if (err) {
      return { ok: false, message: tr("shop.insufficient"), detail: err };
    }
    return {
      ok: true,
      message: tr("shop.seeds_bought"),
      detail: tr("shop.seeds_bought_detail", { qty, name: tr(`crop.${cropId}`) }),
      fxLabel: tr(`crop.${cropId}`),
    };
  },

  /**
   * Compra de animales. Autenticado: paga con el saldo USDT del wallet
   * (débito server-authoritative; sin saldo el backend rechaza). Sin sesión
   * (dev local): paga con el oro del juego como siempre.
   */
  buyAnimal: async (kind, qty) => {
    if (invalidQty(qty)) {
      return { ok: false, message: tr("shop.invalid_qty"), detail: tr("shop.invalid_qty_detail") };
    }
    const def = getAnimalEconomy(kind);
    if (!def) return { ok: false, message: tr("shop.unavailable") };
    const cap = capacityFor(kind);
    if (cap.used + qty > cap.capacity) return noCapacity(cap.building, cap.capacity, qty);
    const cost = def.price * qty;
    if (useAuthStore.getState().status === "authenticated") {
      // El wallet maneja unidades menores (centavos): convertir desde dólares.
      const err = await useWalletStore.getState().spendUSD(Math.round(cost * 100), `animal:${kind}`, { qty });
      if (err) {
        return insufficient(cost, useWalletStore.getState().usdtMinor / 100);
      }
    } else if (!useEconomyStore.getState().spendGold(cost)) {
      return insufficient(cost);
    }
    const farm = useFarmStore.getState();
    for (let i = 0; i < qty; i++) farm.registerAnimal(createAnimalAgent(kind, animalName(kind)));
    // Autenticado: el backend registra el conteo para validar producción server-side.
    void useGoodsStore.getState().registerAnimals([{ kind, qty }]);
    return {
      ok: true,
      message: tr("shop.animal_bought", {
        name: tr(`animal.${kind}`).toUpperCase(),
        suffix: kind === "cow" ? "A" : "O",
      }),
      detail: tr("shop.animal_bought_detail", { qty, money: `$${(def.price * qty).toFixed(2)}` }),
      fxLabel: tr(`animal.${kind}`),
    };
  },

  buyCombo: async (comboId) => {
    const def = getOffer(comboId);
    if (!def) return { ok: false, message: tr("shop.offer_unavailable") };
    const sale = offerSalePrice(def);
    const normal = offerNormalPrice(def);
    const discount = effectiveDiscount(def);

    const capErr = validateAnimalCapacity(def.items);
    if (capErr) return capErr;

    if (useAuthStore.getState().status === "authenticated") {
      const err = await useWalletStore.getState().spendUSD(Math.round(sale * 100), `combo:${comboId}`);
      if (err) {
        return insufficient(sale, useWalletStore.getState().usdtMinor / 100);
      }
    } else if (!useEconomyStore.getState().spendGold(sale)) {
      return insufficient(sale);
    }

    const farm = useFarmStore.getState();
    const animalItems: { kind: AnimalKind; qty: number }[] = [];
    const seedItems: { cropId: string; qty: number }[] = [];
    for (const item of def.items) {
      if (item.qty <= 0) continue;
      if (item.type === "seed") {
        seedItems.push({ cropId: item.cropId, qty: item.qty });
        useCropStore.setState((s) => {
          const cur = s.inventory[item.cropId] ?? { seeds: 0, harvest: 0 };
          return {
            inventory: {
              ...s.inventory,
              [item.cropId]: { ...cur, seeds: cur.seeds + item.qty },
            },
          };
        });
      } else {
        animalItems.push({ kind: item.kind, qty: item.qty });
        for (let i = 0; i < item.qty; i++) {
          farm.registerAnimal(createAnimalAgent(item.kind, animalName(item.kind)));
        }
      }
    }
    if (animalItems.length > 0) {
      void useGoodsStore.getState().registerAnimals(animalItems);
    }
    if (seedItems.length > 0) {
      void useCropStore.getState().grantSeeds(seedItems);
    }
    const saved = normal - sale;
    return {
      ok: true,
      message: tr("shop.offer_bought", { name: tr(`offer.${comboId}.name`).toUpperCase() }),
      detail: tr("shop.offer_bought_detail", {
        pct: Math.round(discount * 100),
        money: `$${saved.toFixed(2)}`,
      }),
      fxLabel: tr(`offer.${comboId}.name`),
    };
  },
}));
