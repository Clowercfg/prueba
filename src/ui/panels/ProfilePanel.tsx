import { useT } from "../../game/stores/languageStore";

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

function PlayerIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <circle cx="12" cy="9" r="2.6" />
      <path d="M7.5 17c.7-2.2 2.4-3.3 4.5-3.3s3.8 1.1 4.5 3.3" />
    </svg>
  );
}

function ReferralsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="8.5" cy="8.5" r="3" />
      <path d="M3 19c.6-3 2.7-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
      <circle cx="16.5" cy="9.5" r="2.4" />
      <path d="M15.5 14.6c2.9-.3 5 .1 5.9 2.9" />
    </svg>
  );
}

/**
 * Shell del panel PERFIL (esquina superior derecha → acceso).
 * Sólo estructura de navegación: la lógica real (datos del jugador,
 * referidos/afiliados, pagos) NO se migra en esta fase.
 *
 * Estructura futura preparada:
 *   Perfil
 *   ├── Información del jugador
 *   └── Referidos
 */
export default function ProfilePanel() {
  const t = useT();
  return (
    <div className="ap-scroll">
      <p className="panel-subtitle">{t("panel.profile.subtitle")}</p>
      <div className="mp-list">
        <div className="mp-item pp-row" role="group">
          <span className="mp-icon mp-icon-svg">
            <PlayerIcon />
          </span>
          <span className="mp-text">
            <b>{t("panel.profile.info_title")}</b>
            <small>{t("panel.profile.info_soon")}</small>
          </span>
        </div>
        <div className="mp-item pp-row" role="group">
          <span className="mp-icon mp-icon-svg">
            <ReferralsIcon />
          </span>
          <span className="mp-text">
            <b>{t("panel.profile.referrals_title")}</b>
            <small>{t("panel.profile.referrals_soon")}</small>
          </span>
        </div>
      </div>
    </div>
  );
}
