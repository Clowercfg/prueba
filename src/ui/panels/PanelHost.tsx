import { Suspense, lazy } from "react";
import { useUiStore } from "../../game/stores/uiStore";
import { useT } from "../../game/stores/languageStore";

/**
 * Punto de entrada único de paneles. La cabecera (título + ✕) vive aquí y el
 * contenido se delega por sección. Los paneles reales se cargan con
 * React.lazy para no engordar el bundle inicial:
 *
 *   animals      → panels/AnimalsPanel    (farmStore)   [REAL]
 *   crops        → panels/CropsPanel      (cropStore + CropSystem)
 *   processing   → panels/ProcessingPanel (processingStore/goodsStore)
 *   store        → panels/Store           (shopStore/economyStore/ofertas)
 *   infrastructure→ panels/Infrastructure (buildingState/upgradesStore)
 */

const AnimalsPanel = lazy(() => import("./AnimalsPanel"));
const CropsPanel = lazy(() => import("./CropsPanel"));
const ProcessingPanel = lazy(() => import("./ProcessingPanel"));
const StorePanel = lazy(() => import("./StorePanel"));
const MorePanel = lazy(() => import("./MorePanel"));
const InventoryPanel = lazy(() => import("./InventoryPanel"));
const InfrastructurePanel = lazy(() => import("./InfrastructurePanel"));
const UpgradesPanel = lazy(() => import("./UpgradesPanel"));
const ProfilePanel = lazy(() => import("./ProfilePanel"));
const LanguagePanel = lazy(() => import("./LanguagePanel"));
const FarmPanel = lazy(() => import("./FarmPanel"));
const WithdrawalsPanel = lazy(() => import("./WithdrawalsPanel"));

const PANEL_TITLE_KEYS: Record<string, string> = {
  animals: 'nav.animals',
  crops: 'nav.crops',
  processing: 'nav.processing',
  infrastructure: 'nav.infrastructure',
  inventory: 'nav.inventory',
  upgrades: 'nav.upgrades',
  more: 'nav.more',
  profile: 'nav.profile',
  language: 'nav.language',
  farm: 'nav.farm',
  withdrawals: 'nav.withdrawals',
}

export function PanelHost() {
  const section = useUiStore((s) => s.section)
  const storeOpen = useUiStore((s) => s.storeOpen)
  const closeOverlays = useUiStore((s) => s.closeOverlays)
  const t = useT()

  if (!section && !storeOpen) return null

  const title =
    storeOpen
      ? t('nav.store')
      : section && PANEL_TITLE_KEYS[section]
        ? t(PANEL_TITLE_KEYS[section])
        : t('nav.panel')

  return (
    <div className="panel-layer">
      {storeOpen || section ? (
        <div className="panel-card" role="dialog" aria-label={title}>
          <header className="panel-head">
            <span className="panel-title">{title}</span>
            <button type="button" className="panel-close" aria-label={t("panel.close_aria")} onClick={closeOverlays}>
              ✕
            </button>
          </header>

          {storeOpen ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <StorePanel />
            </Suspense>
          ) : section === "farm" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <FarmPanel />
            </Suspense>
          ) : section === "animals" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <AnimalsPanel />
            </Suspense>
          ) : section === "crops" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <CropsPanel />
            </Suspense>
          ) : section === "processing" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <ProcessingPanel />
            </Suspense>
          ) : section === "more" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <MorePanel />
            </Suspense>
          ) : section === "inventory" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <InventoryPanel />
            </Suspense>
          ) : section === "infrastructure" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <InfrastructurePanel />
            </Suspense>
          ) : section === "upgrades" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <UpgradesPanel />
            </Suspense>
          ) : section === "profile" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <ProfilePanel />
            </Suspense>
          ) : section === "language" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <LanguagePanel />
            </Suspense>
          ) : section === "withdrawals" ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <WithdrawalsPanel />
            </Suspense>
          ) : (
            <p className="panel-soon">{t("nav.coming_soon")}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
