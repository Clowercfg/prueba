import { Suspense, lazy } from "react";
import { useUiStore } from "../../game/stores/uiStore";

/**
 * Punto de entrada único de paneles. La cabecera (título + ✕) vive aquí y el
 * contenido se delega por sección. Los paneles reales se cargan con
 * React.lazy para no engordar el bundle inicial:
 *
 *   animals      → panels/AnimalsPanel    (farmStore)   [REAL]
 *   crops        → panels/CropsPanel      (cropStore + CropSystem)
 *   processing   → panels/ProcessingPanel (processingStore/goodsStore)
 *   store        → panels/Store           (shopStore/economyStore/ofertas)
 *   veterinary   → panels/VetPanel        (vetStore)
 *   infrastructure→ panels/Infrastructure (buildingState/upgradesStore)
 */

const AnimalsPanel = lazy(() => import("./AnimalsPanel"));

const PANEL_TITLES: Record<string, string> = {
  animals: 'Animales',
  crops: 'Cultivos',
  processing: 'Procesar',
  veterinary: 'Veterinario',
  infrastructure: 'Infraestructura',
}

export function PanelHost() {
  const section = useUiStore((s) => s.section)
  const storeOpen = useUiStore((s) => s.storeOpen)
  const closeOverlays = useUiStore((s) => s.closeOverlays)

  if (!section && !storeOpen) return null

  const title =
    storeOpen ? 'Tienda' : section && PANEL_TITLES[section] ? PANEL_TITLES[section] : 'Panel'

  return (
    <div className="panel-layer">
      {storeOpen || section ? (
        <div className="panel-card" role="dialog" aria-label={title}>
          <header className="panel-head">
            <span className="panel-title">{title}</span>
            <button type="button" className="panel-close" aria-label="Cerrar" onClick={closeOverlays}>
              ✕
            </button>
          </header>

          {section === "animals" && !storeOpen ? (
            <Suspense fallback={<p className="panel-loading">…</p>}>
              <AnimalsPanel />
            </Suspense>
          ) : (
            <p className="panel-soon">Disponible próximamente</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
