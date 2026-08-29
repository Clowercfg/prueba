import { useGoodsStore } from "../../game/stores/goodsStore";
import { useCropStore } from "../../game/stores/cropStore";
import { CROP_ECONOMY, GOODS_ECONOMY } from "../../game/config/economyConfig";
import { useT } from "../../game/stores/languageStore";

/**
 * Inventario real: Almacén (goodsStore) + semillas/cosechas (cropStore).
 * Sólo lectura de estado y acciones existentes (sellGoods/sellHarvest);
 * no hay inventario paralelo ni precios calculados aquí.
 */

const money = (n: number) => `$${n.toFixed(2)}`;

const CROP_ICON: Record<string, string> = {
  wheat: "🌾",
  corn: "🌽",
  carrot: "🥕",
  potato: "🥔",
};

function GoodRow({ goodId }: { goodId: string }) {
  const t = useT();
  const qty = useGoodsStore((s) => s.inventory[goodId] ?? 0);
  const sellGoods = useGoodsStore((s) => s.sellGoods);
  const def = GOODS_ECONOMY[goodId];
  if (qty <= 0) return null;
  return (
    <div className="row-card">
      <span className="rc-icon">{def.icon}</span>
      <span className="rc-main">
        <b>{def.name}</b>
        <small>
          ×{qty} · {money(def.sellPrice)} {t("panel.inventory.each")}
        </small>
      </span>
      <button type="button" className="cp-sell" onClick={() => void sellGoods(goodId, 1)}>
        {t("crate.sell_1")}
      </button>
      <button type="button" className="cp-sell" onClick={() => void sellGoods(goodId, qty)}>
        {t("panel.inventory.all")}
      </button>
    </div>
  );
}

function CropRow({ cropId }: { cropId: string }) {
  const t = useT();
  const seeds = useCropStore((s) => s.inventory[cropId]?.seeds ?? 0);
  const harvest = useCropStore((s) => s.inventory[cropId]?.harvest ?? 0);
  const sellHarvest = useCropStore((s) => s.sellHarvest);
  const def = CROP_ECONOMY[cropId];
  return (
    <div className="row-card">
      <span className="rc-icon">{CROP_ICON[cropId] ?? "🌱"}</span>
      <span className="rc-main">
        <b>{def.name}</b>
        <small>{t("panel.inventory.crop_line", { seeds, harvest, sell: money(def.sellPrice) })}</small>
      </span>
      {harvest > 0 && (
        <>
          <button type="button" className="cp-sell" onClick={() => void sellHarvest(cropId, 1)}>
            {t("crate.sell_1")}
          </button>
          <button type="button" className="cp-sell" onClick={() => void sellHarvest(cropId, harvest)}>
            {t("panel.inventory.all")}
          </button>
        </>
      )}
    </div>
  );
}

export default function InventoryPanel() {
  const t = useT();
  const goodsQty = useGoodsStore((s) => Object.values(s.inventory).reduce((a, b) => a + b, 0));
  return (
    <div className="ap-scroll">
      <h3 className="st-section">{t("panel.inventory.goods_title")}</h3>
      {goodsQty === 0 ? (
        <p className="ap-empty">{t("panel.inventory.empty_goods")}</p>
      ) : (
        <div className="iv-list">
          {Object.keys(GOODS_ECONOMY).map((id) => (
            <GoodRow key={id} goodId={id} />
          ))}
        </div>
      )}

      <h3 className="st-section">{t("panel.inventory.seeds_harvests")}</h3>
      <div className="iv-list">
        {Object.keys(CROP_ECONOMY).map((id) => (
          <CropRow key={id} cropId={id} />
        ))}
      </div>
    </div>
  );
}
