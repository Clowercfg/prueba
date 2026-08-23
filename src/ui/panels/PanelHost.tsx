import { useUiStore } from '../../game/stores/uiStore'

/**
 * Punto de entrada único de paneles. Hoy renderiza placeholders; cada caso
 * está aislado para sustituirlo después por React.lazy(() => import(...))
 * SIN tocar la barra ni el Game Core:
 *
 *   animals      → panels/AnimalsPanel    (farmStore)
 *   crops        → panels/CropsPanel      (cropStore + CropSystem)
 *   processing   → panels/ProcessingPanel (processingStore/goodsStore)
 *   store        → panels/Store           (shopStore/economyStore/ofertas)
 *   veterinary   → panels/VetPanel        (vetStore)
 *   infrastructure→ panels/Infrastructure (buildingState/upgradesStore)
 */

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
          <p className="panel-soon">Disponible próximamente</p>
        </div>
      ) : null}
    </div>
  )
}
