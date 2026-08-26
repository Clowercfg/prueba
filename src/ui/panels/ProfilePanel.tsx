import { useState } from "react";
import { useT } from "../../game/stores/languageStore";
import { useAuthStore } from "../../game/stores/authStore";

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
 * Panel PERFIL (esquina superior derecha → acceso).
 *   Perfil
 *   ├── Información del jugador (nombre y ID de Telegram, datos del backend)
 *   └── Referidos (próximamente)
 */
export default function ProfilePanel() {
  const t = useT();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.me?.user ?? null);
  const [infoOpen, setInfoOpen] = useState(false);

  const displayName =
    user?.firstName?.trim() ||
    (user?.username ? `@${user.username}` : null) ||
    t("panel.profile.unknown");

  return (
    <div className="ap-scroll">
      <p className="panel-subtitle">{t("panel.profile.subtitle")}</p>
      <div className="mp-list">
        <button
          type="button"
          className="mp-item pp-row pp-toggle"
          onClick={() => setInfoOpen((v) => !v)}
          aria-expanded={infoOpen}
        >
          <span className="mp-icon mp-icon-svg">
            <PlayerIcon />
          </span>
          <span className="mp-text">
            <b>{t("panel.profile.info_title")}</b>
            <small>
              {status === "authenticated"
                ? displayName
                : t("panel.profile.info_login")}
            </small>
          </span>
          <span className={`pp-chevron ${infoOpen ? "open" : ""}`} aria-hidden>
            ›
          </span>
        </button>

        {infoOpen && (
          <div className="pp-info" role="group">
            {status === "authenticated" && user ? (
              <>
                <div className="pp-info-row">
                  <span className="pp-info-label">{t("panel.profile.name")}</span>
                  <b className="pp-info-value">{displayName}</b>
                </div>
                {user.username && (
                  <div className="pp-info-row">
                    <span className="pp-info-label">{t("panel.profile.username")}</span>
                    <b className="pp-info-value">@{user.username}</b>
                  </div>
                )}
                <div className="pp-info-row">
                  <span className="pp-info-label">{t("panel.profile.tgid")}</span>
                  <b className="pp-info-value pp-info-mono">{user.telegramId}</b>
                </div>
              </>
            ) : (
              <p className="pp-info-empty">{t("panel.profile.info_login")}</p>
            )}
          </div>
        )}

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
