import { useState } from "react";
import { useShopStore, type ShopResult } from "../../game/stores/shopStore";
import { useEconomyStore } from "../../game/stores/economyStore";
import {
  CROP_ECONOMY,
  ANIMAL_ECONOMY,
} from "../../game/config/economyConfig";
import {
  OFFERS,
  offerNormalPrice,
  offerSalePrice,
  effectiveDiscount,
} from "../../game/config/offersConfig";
import type { AnimalKind } from "../../game/types/entities";
import { useT, t as tr, useLanguageStore, localeFor } from "../../game/stores/languageStore";
import { useUiStore } from "../../game/stores/uiStore";
import { useWalletStore } from "../../game/stores/walletStore";
import { DepositPanel } from "./DepositPanel";

/**
 * Panel de Tienda (contenido). Sólo consume catálogos de config y acciones
 * de shopStore (buySeed/buyAnimal/buyCombo); el saldo real vive en el wallet
 * USDT del backend (walletStore). Ningún precio se calcula aquí.
 */

const CROP_ICON: Record<string, string> = {
  wheat: "🌾",
  corn: "🌽",
  carrot: "🥕",
  potato: "🥔",
};

const money = (n: number) => `$${n.toFixed(2)}`;

function UsdIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="#4caf50" />
      <path d="M12 6.2v11.6M14.8 8.6c-.6-.9-1.6-1.4-2.8-1.4-1.7 0-3 .9-3 2.3 0 3 5.9 1.6 5.9 4.6 0 1.4-1.3 2.3-3 2.3-1.3 0-2.4-.6-3-1.5" fill="none" stroke="#0e3d16" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Notice({ result }: { result: ShopResult | null }) {
  if (!result) return null;
  return (
    <p className={`ap-notice ${result.ok ? "st-ok" : "st-err"}`}>
      <b>{result.message}</b>
      {result.detail ? ` — ${result.detail}` : ""}
    </p>
  );
}

function SeedCard({ cropId, onResult }: { cropId: string; onResult: (r: ShopResult) => void }) {
  const t = useT();
  const buySeed = useShopStore((s) => s.buySeed);
  const def = CROP_ECONOMY[cropId];
  return (
    <div className="st-card">
      <span className="st-icon">{CROP_ICON[cropId] ?? "🌱"}</span>
      <span className="st-name">{t(`crop.${cropId}`)}</span>
      <span className="st-price">{money(def.seedPrice)}</span>
      <button
        type="button"
        className="ap-buy"
        onClick={() => void buySeed(cropId, 1).then(onResult)}
      >
        {tr("store.comprar")}
      </button>
    </div>
  );
}

function AnimalCard({ kind, onResult }: { kind: AnimalKind; onResult: (r: ShopResult) => void }) {
  const buyAnimal = useShopStore((s) => s.buyAnimal);
  const def = ANIMAL_ECONOMY[kind];
  return (
    <div className="st-card">
      <span className="st-icon">{def.icon}</span>
      <span className="st-name">{def.name}</span>
      <span className="st-price">{money(def.price)}</span>
      <button
        type="button"
        className="ap-buy"
        onClick={() => void buyAnimal(kind, 1).then(onResult)}
      >
        {tr("store.comprar")}
      </button>
    </div>
  );
}

function OfferCard({ offerId, onResult }: { offerId: string; onResult: (r: ShopResult) => void }) {
  const buyCombo = useShopStore((s) => s.buyCombo);
  // El catálogo es la propia config: buscamos la oferta viva por id.
  const def = OFFERS.find((o) => o.id === offerId)!;
  const normal = offerNormalPrice(def);
  const sale = offerSalePrice(def);
  const pct = Math.round(effectiveDiscount(def) * 100);

  return (
    <div className="st-offer">
      <header className="ap-group-head">
        <span className="ap-group-icon">{def.icon}</span>
        <span className="ap-group-title">
          <b>{tr(`offer.${def.id}.name`)}</b>
          <small>{def.description || tr(`offer.${def.id}.desc`)}</small>
        </span>
        {pct > 0 && <span className="st-badge">-{pct}%</span>}
      </header>
      <p className="st-prices">
        <s>{money(normal)}</s> <b>{money(sale)}</b>{" "}
        <em>{tr("store.offer.saving", { money: money(normal - sale) })}</em>
      </p>
      <button
        type="button"
        className="ap-buy st-buy-wide"
        onClick={() => void buyCombo(def.id).then(onResult)}
      >
        {tr("store.offer.buy_combo")}
      </button>
    </div>
  );
}

export default function StorePanel() {
  const [result, setResult] = useState<ShopResult | null>(null);
  const depositOpen = useUiStore((s) => s.depositOpen);
  const closeDeposits = useUiStore((s) => s.closeDeposits);
  const openDeposits = useUiStore((s) => s.openDeposits);
  const usdtMinor = useWalletStore((s) => s.usdtMinor);
  const diamonds = useEconomyStore((s) => s.diamonds);
  const lang = useLanguageStore((s) => s.lang);

  return (
    <div className="ap-scroll">
      <div className="st-balance">
        <span>💎 {diamonds.toLocaleString(localeFor(lang))}</span>
        <span className="st-usdt">
          <UsdIcon /> ${(usdtMinor / 100).toFixed(2)}
        </span>
        <button type="button" className="st-deposit-btn" onClick={openDeposits}>
          {tr("store.deposit_button")}
        </button>
      </div>

      <Notice result={result} />

      <h3 className="st-section">{tr("store.seeds_title")}</h3>
      <div className="st-grid">
        {Object.keys(CROP_ECONOMY).map((id) => (
          <SeedCard key={id} cropId={id} onResult={setResult} />
        ))}
      </div>

      <h3 className="st-section">{tr("store.animals_title")}</h3>
      <div className="st-grid">
        {(Object.keys(ANIMAL_ECONOMY) as AnimalKind[]).map((kind) => (
          <AnimalCard key={kind} kind={kind} onResult={setResult} />
        ))}
      </div>

      <h3 className="st-section">{tr("store.offers_title")}</h3>
      <div className="st-offers">
        {OFFERS.map((o) => (
          <OfferCard key={o.id} offerId={o.id} onResult={setResult} />
        ))}
      </div>

      {depositOpen && <DepositPanel onClose={closeDeposits} />}
    </div>
  );
}
