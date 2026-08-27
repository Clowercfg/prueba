import { useUiStore } from "../../game/stores/uiStore";

/**
 * Menú secundario "Más": navegación pura hacia paneles ya migrados.
 * Ninguna lógica de negocio vive aquí (sólo uiStore.openSection).
 * Idioma/referidos/pagos/perfil/admin quedan deliberadamente fuera
 * (tienen ubicación propia en la navegación superior). Iconos SVG
 * inline uniformes con la navegación principal.
 */

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

function BoxIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" />
    </svg>
  );
}

function CraneIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 21h16" />
      <path d="M6 21V10l6-5 6 5v11" />
      <path d="M9.5 21v-5h5v5" />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 20V6" />
      <path d="m6 12 6-6 6 6" />
      <path d="M6 3.5h12" />
    </svg>
  );
}

function HealthIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <circle cx="17" cy="14.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <circle cx="17" cy="7" r="2.5" />
      <path d="M19 21v-1.5a3 3 0 0 0-2.5-3" />
    </svg>
  );
}

const ICONS: Record<string, () => React.ReactElement> = {
  inventory: BoxIcon,
  infrastructure: CraneIcon,
  upgrades: UpIcon,
  veterinary: HealthIcon,
  withdrawals: WalletIcon,
  affiliates: UsersIcon,
};

const OPTIONS = [
  { id: "inventory", name: "Inventario", desc: "Gestiona tus productos y recursos" },
  { id: "infrastructure", name: "Infraestructura", desc: "Gestiona edificios y capacidades" },
  { id: "upgrades", name: "Mejoras", desc: "Mejora tus instalaciones" },
  { id: "veterinary", name: "Veterinario", desc: "Salud y tratamiento de animales" },
  { id: "withdrawals", name: "Retiros", desc: "Retira tu saldo USDT" },
  { id: "affiliates", name: "Referidos", desc: "Invita amigos y gana comisiones" },
] as const;

export default function MorePanel() {
  const openSection = useUiStore((s) => s.openSection);
  return (
    <div className="ap-scroll">
      <div className="mp-list">
        {OPTIONS.map((o) => {
          const Icon = ICONS[o.id];
          return (
            <button
              key={o.id}
              type="button"
              className="mp-item"
              onClick={() => openSection(o.id)}
            >
              <span className="mp-icon mp-icon-svg">{Icon && <Icon />}</span>
              <span className="mp-text">
                <b>{o.name}</b>
                <small>{o.desc}</small>
              </span>
              <span className="mp-arrow">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
