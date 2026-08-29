import type { ReactElement, ReactNode } from "react";
import { PLOT_ECONOMY } from "../../game/config/cropsConfig";
import { useCropStore } from "../../game/stores/cropStore";
import { useEconomyStore } from "../../game/stores/economyStore";
import { useFarmStore } from "../../game/stores/farmStore";
import { useGoodsStore } from "../../game/stores/goodsStore";
import { useProcessingStore } from "../../game/stores/processingStore";
import { useUpgradesStore } from "../../game/stores/upgradesStore";
import { useUiStore, type GameSectionId } from "../../game/stores/uiStore";
import { useT, useLanguageStore, localeFor } from "../../game/stores/languageStore";

/**
 * Centro de Gestión de la Granja (dashboard de solo lectura).
 * Todas las cifras se derivan en render desde los stores existentes
 * (única fuente de verdad): cero datos duplicados, cero timers/polling.
 * El mapa (canvas) sigue siendo la representación visual; la gestión
 * vive aquí y los accesos rápidos reutilizan uiStore + PanelHost.
 */

const SPECIES_ORDER = ["cow", "chicken", "rooster", "pig"] as const;
const BUILDINGS = ["granary", "processing", "coop", "stable", "pigPen", "incubator"] as const;

const GOOD_LABEL: Record<string, string> = {
  eggs: "product.eggs",
  milk: "product.milk",
  meat: "product.meat",
  "boiled-eggs": "product.boiled-eggs",
};

export interface CropsSummary {
  total: number;
  plantedPlots: number;
  empty: number;
  growing: number;
  ready: number;
  byType: Record<string, number>;
}

/** Selector puro: resumen de cultivos desde cropStore.planted. */
export function summarizeCrops(
  planted: Array<{ plotIndex: number; state: string; cropId: string }>
): CropsSummary {
  const plots = new Set<number>();
  const byType: Record<string, number> = {};
  let growing = 0;
  let ready = 0;
  for (const c of planted) {
    plots.add(c.plotIndex);
    byType[c.cropId] = (byType[c.cropId] ?? 0) + 1;
    if (c.state === "ready") ready++;
    else growing++;
  }
  return {
    total: PLOT_ECONOMY.length,
    plantedPlots: plots.size,
    empty: PLOT_ECONOMY.length - plots.size,
    growing,
    ready,
    byType,
  };
}

export interface AnimalsSummary {
  total: number;
  byKind: Record<string, number>;
}

/** Selector puro: animales por especie desde farmStore.animals. */
export function summarizeAnimals(animals: Array<{ kind: string }>): AnimalsSummary {
  const byKind: Record<string, number> = {};
  for (const a of animals) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
  return { total: animals.length, byKind };
}

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CoinIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 9.5h5M9.5 14.5h5M12 8v8" />
    </svg>
  );
}

function PlantIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 21V10" />
      <path d="M12 14c0-4-2.8-6-7-6 0 4.2 2.8 6 7 6Z" />
      <path d="M12 11c0-4 2.8-6 7-6 0 4.2-2.8 6-7 6Z" />
    </svg>
  );
}

function CowIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 6c0 3 .8 5 2.5 6M20 6c0 3-.8 5-2.5 6" />
      <circle cx="12" cy="13" r="4.5" />
      <circle cx="10.4" cy="12" r=".6" fill="currentColor" stroke="none" />
      <circle cx="13.6" cy="12" r=".6" fill="currentColor" stroke="none" />
      <path d="M10.5 15h3" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" />
    </svg>
  );
}

function HouseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v9h14v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

function Card({
  icon,
  title,
  target,
  children,
}: {
  icon: ReactElement;
  title: string;
  target?: GameSectionId;
  children: ReactNode;
}) {
  const openSection = useUiStore((s) => s.openSection);
  const t = useT();
  return (
    <section className="db-card" data-sec={target ?? title.toLowerCase()}>
      <header className="db-head">
        <span className="db-icon">{icon}</span>
        <span className="db-title">{title}</span>
        {target ? (
          <button
            type="button"
            className="db-open"
            onClick={() => openSection(target)}
          >
            {t("dashboard.open_section")}
          </button>
        ) : null}
      </header>
      <div className="db-body">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: ReactNode; value?: ReactNode }) {
  return (
    <div className="db-row">
      <span className="db-label">{label}</span>
      {value != null ? <span className="db-value">{value}</span> : null}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="db-chip">{children}</span>;
}

export default function FarmPanel() {
  const t = useT();
  const lang = useLanguageStore((s) => s.lang);
  const planted = useCropStore((s) => s.planted);
  const cropInv = useCropStore((s) => s.inventory);
  const animals = useFarmStore((s) => s.animals);
  const gold = useEconomyStore((s) => s.gold);
  const diamonds = useEconomyStore((s) => s.diamonds);
  const income = useEconomyStore((s) => s.totalIncome);
  const expenses = useEconomyStore((s) => s.totalExpenses);
  const goods = useGoodsStore((s) => s.inventory);
  const jobs = useProcessingStore((s) => s.jobs);
  const levels = useUpgradesStore((s) => s.levels);
  const capacityOf = useUpgradesStore((s) => s.capacityOf);

  const crops = summarizeCrops(planted);
  const herd = summarizeAnimals(animals);

  const procLevel = levels["processing"] ?? 0;
  const procCapacity = capacityOf("processing");
  const inProcess = jobs.reduce((n, j) => n + j.qty, 0);

  const goodsList = Object.entries(goods).filter(([, qty]) => qty > 0);
  const seedsTotal = Object.values(cropInv).reduce((n, i) => n + i.seeds, 0);
  const harvestTotal = Object.values(cropInv).reduce((n, i) => n + i.harvest, 0);

  const money = (v: number) => Math.floor(v).toLocaleString(localeFor(lang));

  return (
    <div className="ap-scroll">
      <Card icon={<CoinIcon />} title={t("dashboard.economy")}>
        <Row label={t("shop.gold")} value={<Chip>{money(gold)}</Chip>} />
        <Row label={t("dashboard.diamonds")} value={<Chip>{money(diamonds)}</Chip>} />
        <Row label={t("dashboard.income", { v: money(income) })} />
        <Row label={t("dashboard.expenses", { v: money(expenses) })} />
      </Card>

      <Card icon={<PlantIcon />} title={t("dashboard.crops")} target="crops">
        <Row label={t("dashboard.plots_total", { n: crops.total })} />
        <div className="db-chips">
          <Chip>{t("dashboard.growing", { n: crops.growing })}</Chip>
          <Chip>{t("dashboard.ready_plots", { n: crops.ready })}</Chip>
          <Chip>{t("dashboard.empty_plots", { n: crops.empty })}</Chip>
        </div>
        {Object.keys(crops.byType).length > 0 ? (
          <div className="db-chips db-chips-muted">
            {Object.entries(crops.byType).map(([id, n]) => (
              <Chip key={id}>{`${t(`crop.${id}`)}: ${n}`}</Chip>
            ))}
          </div>
        ) : null}
      </Card>

      <Card icon={<CowIcon />} title={t("dashboard.animals")} target="animals">
        <Row label={t("dashboard.total", { n: herd.total })} />
        <div className="db-chips">
          {SPECIES_ORDER.filter((k) => (herd.byKind[k] ?? 0) > 0).map((k) => (
            <Chip key={k}>{`${t(`species.${k}`)}: ${herd.byKind[k]}`}</Chip>
          ))}
        </div>
      </Card>

      <Card icon={<GearIcon />} title={t("dashboard.production")} target="processing">
        <Row
          label={
            procLevel > 0 ? t("dashboard.level_n", { n: procLevel }) : t("dashboard.not_built")
          }
        />
        {procLevel > 0 ? (
          <>
            <Row label={t("dashboard.capacity", { n: procCapacity })} />
            <Row label={t("dashboard.active_jobs", { n: jobs.length })} />
            <Row label={t("dashboard.in_process", { n: inProcess })} />
          </>
        ) : null}
      </Card>

      <Card icon={<BoxIcon />} title={t("dashboard.inventory")} target="inventory">
        {goodsList.length === 0 && harvestTotal === 0 && seedsTotal === 0 ? (
          <p className="db-empty">{t("dashboard.empty_inv")}</p>
        ) : (
          <>
            <div className="db-chips">
              {goodsList.map(([id, qty]) =>
                GOOD_LABEL[id] ? (
                  <Chip key={id}>{`${t(GOOD_LABEL[id])}: ${qty}`}</Chip>
                ) : null
              )}
              {harvestTotal > 0 ? <Chip>{t("dashboard.harvest_total", { n: harvestTotal })}</Chip> : null}
              {seedsTotal > 0 ? <Chip>{t("dashboard.seeds_total", { n: seedsTotal })}</Chip> : null}
            </div>
          </>
        )}
      </Card>

      <Card icon={<HouseIcon />} title={t("dashboard.infrastructure")} target="infrastructure">
        {BUILDINGS.map((id) => (
          <Row
            key={id}
            label={t(`upgrade.${id}`)}
            value={
              (levels[id] ?? 0) > 0 ? (
                <Chip>{t("dashboard.level_n", { n: levels[id] })}</Chip>
              ) : (
                <span className="db-lock">{t("dashboard.not_built")}</span>
              )
            }
          />
        ))}
      </Card>
    </div>
  );
}
