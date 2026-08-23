import { useUiStore } from "../../game/stores/uiStore";

/**
 * Menú secundario "Más": navegación pura hacia paneles ya migrados.
 * Ninguna lógica de negocio vive aquí (sólo uiStore.openSection).
 * Idioma/referidos/pagos/perfil/admin quedan deliberadamente fuera.
 */

const OPTIONS = [
  { id: "inventory", icon: "📦", name: "Inventario", desc: "Gestiona tus productos y recursos" },
  { id: "infrastructure", icon: "🏗️", name: "Infraestructura", desc: "Gestiona edificios y capacidades" },
  { id: "upgrades", icon: "⬆️", name: "Mejoras", desc: "Mejora tus instalaciones" },
  { id: "veterinary", icon: "🩺", name: "Veterinario", desc: "Salud y tratamiento de animales" },
] as const;

export default function MorePanel() {
  const openSection = useUiStore((s) => s.openSection);
  return (
    <div className="ap-scroll">
      <div className="mp-list">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className="mp-item"
            onClick={() => openSection(o.id)}
          >
            <span className="mp-icon">{o.icon}</span>
            <span className="mp-text">
              <b>{o.name}</b>
              <small>{o.desc}</small>
            </span>
            <span className="mp-arrow">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
