import { useT } from "../../game/stores/languageStore";

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
          <span className="mp-icon">🧑‍🌾</span>
          <span className="mp-text">
            <b>{t("panel.profile.info_title")}</b>
            <small>{t("panel.profile.info_soon")}</small>
          </span>
        </div>
        <div className="mp-item pp-row" role="group">
          <span className="mp-icon">🤝</span>
          <span className="mp-text">
            <b>{t("panel.profile.referrals_title")}</b>
            <small>{t("panel.profile.referrals_soon")}</small>
          </span>
        </div>
      </div>
    </div>
  );
}
