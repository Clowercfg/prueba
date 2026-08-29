import { useEffect, useMemo, useState } from "react";
import { useCropStore, growthMsOf, type PlantedCrop } from "../../game/stores/cropStore";
import { CROP_ECONOMY, getCropEconomy } from "../../game/config/economyConfig";
import { useT, t as tr } from "../../game/stores/languageStore";
import { PLOT_KEYS } from "../../game/stores/gameStore";

/**
 * Panel de Cultivos (contenido). Consume SOLO estado real (cropStore +
 * economyConfig) y dispara acciones existentes (buySeed/plantCrop/
 * harvestCrop/sellHarvest). El crecimiento lo gestiona CropSystem; aquí no
 * hay timers del juego: sólo un reloj de UI para refrescar barra/tiempo.
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

const plotName = (index: number): string => {
  const key = PLOT_KEYS[index];
  if (!key) return tr("panel.crops.plot_number", { n: index + 1 });
  const letter = key.replace("plot", "");
  return tr("panel.crops.plot_number", { n: letter || index + 1 });
};

/** Reloj de UI: refresca cada segundo mientras haya cultivos en curso. */
function useUiClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function fmtRemaining(planted: PlantedCrop, now: number): string {
  const msLeft = Math.max(0, growthMsOf(planted) - (now - planted.plantedAt));
  const totalMin = Math.ceil(msLeft / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (totalMin > 0) return `${m} min`;
  return "<1 min";
}

function PlantedRow({ p, now }: { p: PlantedCrop; now: number }) {
  const t = useT();
  const harvestCrop = useCropStore((s) => s.harvestCrop);
  const econ = getCropEconomy(p.cropId);
  const ready = p.state === "ready";
  const ms = growthMsOf(p);
  const progress = ready ? 1 : ms > 0 ? Math.min(1, (now - p.plantedAt) / ms) : 1;

  return (
    <div className="ap-row cp-row-static">
      <span className="ap-row-icon">{(econ && CROP_ICON[p.cropId]) || "🌱"}</span>
      <span className="ap-row-main">
        <span className="ap-name">
          {econ?.name ?? p.cropId} · {plotName(p.plotIndex)}
        </span>
        <span className={`ap-chip ${ready ? "harvested" : "recovering"}`}>
          {ready ? t("panel.crops.ready_short_value") : t("panel.crops.growing_short")}
        </span>
        <div className="ap-bar">
          <div
            className={`ap-bar-fill ${progress >= 1 ? "good" : "warn"}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        {!ready && (
          <span className="cp-remaining">{t("panel.crops.remaining", { time: fmtRemaining(p, now) })}</span>
        )}
      </span>
      {ready && (
        <button
          type="button"
          className="cp-harvest"
          onClick={() => void harvestCrop(p.id)}
        >
          {t("panel.crops.harvest_btn")}
        </button>
      )}
    </div>
  );
}

function CropGroup({ cropId }: { cropId: string }) {
  const t = useT();
  const buySeed = useCropStore((s) => s.buySeed);
  const sellHarvest = useCropStore((s) => s.sellHarvest);
  const plantCrop = useCropStore((s) => s.plantCrop);
  const seeds = useCropStore((s) => s.inventory[cropId]?.seeds ?? 0);
  const harvestQty = useCropStore((s) => s.inventory[cropId]?.harvest ?? 0);
  // Suscripción a `planted` para recalcular hueco libre cuando cambie.
  const plantedLen = useCropStore((s) => s.planted.length);
  const emptyPlot = useMemo(
    () => useCropStore.getState().findEmptyPlot(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plantedLen],
  );
  const econ = CROP_ECONOMY[cropId];

  const plantNext = (): void => {
    const idx = emptyPlot !== -1 ? emptyPlot : useCropStore.getState().findEmptyPlot();
    if (idx === -1) return;
    void plantCrop(cropId, idx);
  };

  return (
    <section className="ap-group">
      <header className="ap-group-head">
        <span className="ap-group-icon">{CROP_ICON[cropId] ?? "🌱"}</span>
        <span className="ap-group-title">
          <b>{t(`crop.${cropId}`)}</b>
          <small>{t("panel.crops.seeds_harvest", { seeds, harvest: harvestQty })}</small>
        </span>
      </header>
      <p className="ap-prod">
        {t("panel.crops.seed_line", {
          price: money(econ.seedPrice),
          sell: money(econ.sellPrice),
          hours: String(econ.growthHours),
        })}
      </p>
      <div className="cp-actions">
        <button type="button" className="ap-buy" onClick={() => void buySeed(cropId, 1)}>
          {t("panel.crops.buy_val", { money: money(econ.seedPrice) })}
        </button>
        <button
          type="button"
          className="cp-sell"
          disabled={harvestQty < 1}
          onClick={() => void sellHarvest(cropId, harvestQty)}
        >
          {t("panel.crops.sell_val", { money: money(econ.sellPrice * harvestQty) })}
        </button>
      </div>
      <button
        type="button"
        className="cp-plant"
        disabled={seeds < 1 || emptyPlot === -1}
        onClick={plantNext}
      >
        {emptyPlot === -1
          ? t("panel.crops.no_plots")
          : t(seeds > 1 ? "panel.crops.plant_with" : "panel.crops.plant_at", {
              name: plotName(emptyPlot),
              seeds: String(seeds),
            })}
      </button>
    </section>
  );
}

export default function CropsPanel() {
  const t = useT();
  const planted = useCropStore((s) => s.planted);
  const now = useUiClock(planted.some((p) => p.state !== "ready"));

  const groups = useMemo(() => CROP_IDS.map((id) => ({ id })), []);

  return (
    <div className="ap-scroll">
      <p className="ap-hint">{t("panel.crops.action_hint")}</p>

      <section className="ap-group">
        <header className="ap-group-head">
          <span className="ap-group-icon">🟫</span>
          <span className="ap-group-title">
            <b>{t("panel.crops.planted")}</b>
            <small>{t("panel.crops.planted_count", { n: planted.length })}</small>
          </span>
        </header>
        {planted.length === 0 ? (
          <p className="ap-none">{t("panel.crops.empty_planted")}</p>
        ) : (
          <div className="ap-list">
            {[...planted]
              .sort((a, b) => a.plotIndex - b.plotIndex)
              .map((p) => (
                <PlantedRow key={p.id} p={p} now={now} />
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
