import { useUiStore } from "../../game/stores/uiStore";
import { useT } from "../../game/stores/languageStore";

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

function WalletIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <circle cx="17" cy="14.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

const ICONS: Record<string, () => React.ReactElement> = {
  inventory: BoxIcon,
  infrastructure: CraneIcon,
  upgrades: UpIcon,
  withdrawals: WalletIcon,
};

const OPTIONS = [
  { id: "inventory", nameKey: "more.inventory", descKey: "more.inventory_desc" },
  { id: "infrastructure", nameKey: "more.infrastructure", descKey: "more.infrastructure_desc" },
  { id: "upgrades", nameKey: "more.upgrades", descKey: "more.upgrades_desc" },
  { id: "withdrawals", nameKey: "more.withdrawals", descKey: "more.withdrawals_desc" },
] as const;

export default function MorePanel() {
  const openSection = useUiStore((s) => s.openSection);
  const t = useT();
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
                <b>{t(o.nameKey)}</b>
                <small>{t(o.descKey)}</small>
              </span>
              <span className="mp-arrow">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
