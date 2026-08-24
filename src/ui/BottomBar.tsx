import { useUiStore } from '../game/stores/uiStore'

/**
 * Navegación principal (capa React pura): ninguna regla de negocio vive aquí,
 * sólo traduce taps a acciones de uiStore (sección activa / tienda / home).
 * El botón "Más" abre el menú secundario (MorePanel vía PanelHost); los
 * paneles reales se cargan con React.lazy.
 */

type TabId = 'farm' | 'animals' | 'crops' | 'processing' | 'store' | 'more'

function Icon({ id }: { id: TabId }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (id) {
    case 'farm':
      return (
        <svg {...common}>
          <path d="M3 11 12 4l9 7" />
          <path d="M5 10v9h14v-9" />
          <path d="M10 19v-5h4v5" />
        </svg>
      )
    case 'animals':
      return (
        <svg {...common}>
          <circle cx="9" cy="7" r="2.6" />
          <circle cx="15.5" cy="8.5" r="2.2" />
          <path d="M4.5 17c.5-3.5 2.6-5.5 5-5.5s4 1.6 4.4 4.4" />
          <circle cx="16" cy="16.5" r="3.4" />
        </svg>
      )
    case 'crops':
      return (
        <svg {...common}>
          <path d="M12 21V9" />
          <path d="M12 13c0-3.5-2.5-5.5-6-5.5 0 3.6 2.4 5.5 6 5.5Z" />
          <path d="M12 11c0-3.5 2.5-5.5 6-5.5 0 3.6-2.4 5.5-6 5.5Z" />
        </svg>
      )
    case 'processing':
      return (
        <svg {...common}>
          <rect x="4" y="12" width="16" height="8" rx="1.5" />
          <path d="M8 12V8l4-3 4 3v4" />
          <path d="M9 16h2m3 0h1.5" />
        </svg>
      )
    case 'store':
      return (
        <svg {...common}>
          <path d="M5 8h14l-1.2 11a1.8 1.8 0 0 1-1.8 1.6H8A1.8 1.8 0 0 1 6.2 19L5 8Z" />
          <path d="M9 10V6a3 3 0 0 1 6 0v4" />
        </svg>
      )
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      )
  }
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'farm', label: 'Granja' },
  { id: 'animals', label: 'Animales' },
  { id: 'crops', label: 'Cultivos' },
  { id: 'processing', label: 'Procesar' },
  { id: 'store', label: 'Tienda' },
  { id: 'more', label: 'Más' },
]

export function BottomBar() {
  const section = useUiStore((s) => s.section)
  const storeOpen = useUiStore((s) => s.storeOpen)
  const toggleSection = useUiStore((s) => s.toggleSection)
  const toggleStore = useUiStore((s) => s.toggleStore)

  const activeTab: TabId =
    storeOpen
      ? 'store'
      : section === 'farm' ||
          section === 'animals' ||
          section === 'crops' ||
          section === 'processing' ||
          section === 'more'
        ? section
        : 'farm'

  function onTab(id: TabId): void {
    // Granja abre/cierra el Centro de Gestión (dashboard); el mapa queda
    // siempre accesible tocando el canvas (closeOverlays) o Esc.
    if (id === 'store') toggleStore()
    else toggleSection(id)
  }

  return (
    <nav className="bottom-bar" aria-label="Navegación principal">
      <div className="bb-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`bb-tab${activeTab === t.id ? ' is-active' : ''}`}
            aria-pressed={activeTab === t.id}
            onClick={() => onTab(t.id)}
          >
            <Icon id={t.id} />
            <span className="bb-label">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
