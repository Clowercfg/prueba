import { useMemo } from "react";
import { useCropStore, growthProgressOf, type PlantedCrop } from "../../game/stores/cropStore";
import { CROP_ECONOMY, getCropEconomy } from "../../game/config/economyConfig";
import { useT } from "../../game/stores/languageStore";
import { PLOT_KEYS } from "../../game/stores/gameStore";

/**
 * Panel de Cultivos (contenido). Consume SOLO estado real (cropStore +
 * economyConfig) y dispara acciones existentes (buySeed/harvestCrop/
 * sellHarvest). El crecimiento lo gestiona CropSystem; aquí no hay timers.
 */

const CROP_IDS = Object.keys(CROP_ECONOMY);

/** Iconografía presentacional del panel (no son datos de juego). */
const CROP_ICON: Record<string, string> = {
  wheat: "🌾",
  corn: "🌽",
  carrot: "🥕",
  potato: "🥔",
};

const money = (n: number) => `$${n.toFixed(2)}`;

function fmtRemaining(planted: PlantedCrop): string {
  const econ = getCropEconomy(planted.cropId);
  if (!econ) return "";
  const msLeft = Math.max(
    0,
    econ.growthHours * 3600 * 1000 - (Date.now() - planted.plantedAt),
  );
  const totalMin = Math.ceil(msLeft / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (totalMin > 0) return `${m} min`;
  return "<1 min";
}

function PlantedRow({ p }: { p: PlantedCrop }) {
  const harvestCrop = useCropStore((s) => s.harvestCrop);
  const econ = getCropEconomy(p.cropId);
  const ready = p.state === "ready";
  const progress = ready ? 1 : growthProgressOf(p);

  return (
    <div className="ap-row cp-row-static">
      <span className="ap-row-icon">{(econ && CROP_ICON[p.cropId]) || "🌱"}</span>
      <span className="ap-row-main">
        <span className="ap-name">
          {econ?.name ?? p.cropId} · {PLOT_KEYS[p.plotIndex] ?? `#${p.plotIndex}`}
        </span>
        <span className={`ap-chip ${ready ? "harvested" : "recovering"}`}>
          {ready ? "Listo" : "Creciendo"}
        </span>
        <div className="ap-bar">
          <div
            className={`ap-bar-fill ${progress >= 1 ? "good" : "warn"}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        {!ready && (
          <span className="cp-remaining">Falta {fmtRemaining(p)}</span>
        )}
      </span>
      {ready && (
        <button
          type="button"
          className="cp-harvest"
          onClick={() => harvestCrop(p.id)}
        >
          Cosechar
        </button>
      )}
    </div>
  );
}

function CropGroup({ cropId }: { cropId: string }) {
  const t = useT();
  const buySeed = useCropStore((s) => s.buySeed);
  const sellHarvest = useCropStore((s) => s.sellHarvest);
  const seeds = useCropStore((s) => s.inventory[cropId]?.seeds ?? 0);
  const harvestQty = useCropStore((s) => s.inventory[cropId]?.harvest ?? 0);
  const econ = CROP_ECONOMY[cropId];

  return (
    <section className="ap-group">
      <header className="ap-group-head">
        <span className="ap-group-icon">{CROP_ICON[cropId] ?? "🌱"}</span>
        <span className="ap-group-title">
          <b>{t(`crop.${cropId}`)}</b>
          <small>
            Semillas {seeds} · Cosecha {harvestQty}
          </small>
        </span>
      </header>
      <p className="ap-prod">
        Semilla {money(econ.seedPrice)} · Venta {money(econ.sellPrice)}/ud ·{" "}
        {econ.growthHours} h
      </p>
      <div className="cp-actions">
        <button type="button" className="ap-buy" onClick={() => buySeed(cropId, 1)}>
          Comprar {money(econ.seedPrice)}
        </button>
        <button
          type="button"
          className="cp-sell"
          disabled={harvestQty < 1}
          onClick={() => sellHarvest(cropId, harvestQty)}
        >
          Vender {money(econ.sellPrice * harvestQty)}
        </button>
      </div>
    </section>
  );
}

export default function CropsPanel() {
  const planted = useCropStore((s) => s.planted);

  const groups = useMemo(() => CROP_IDS.map((id) => ({ id })), []);

  return (
    <div className="ap-scroll">
      <p className="ap-hint">
        Toca una parcela vacía de la granja para sembrar; cuando esté lista,
        tócala de nuevo o cosecha desde aquí.
      </p>

      <section className="ap-group">
        <header className="ap-group-head">
          <span className="ap-group-icon">🟫</span>
          <span className="ap-group-title">
            <b>En las parcelas</b>
            <small>{planted.length} cultivo(s)</small>
          </span>
        </header>
        {planted.length === 0 ? (
          <p className="ap-none">No hay cultivos plantados.</p>
        ) : (
          <div className="ap-list">
            {[...planted]
              .sort((a, b) => a.plotIndex - b.plotIndex)
              .map((p) => (
                <PlantedRow key={p.id} p={p} />
              ))}
          </div>
        )}
      </section>

      {groups.map(({ id }) => (
        <CropGroup key={id} cropId={id} />
      ))}
    </div>
  );
}
