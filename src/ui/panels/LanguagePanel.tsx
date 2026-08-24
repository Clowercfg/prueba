import { useLanguageStore, useT, type Lang } from "../../game/stores/languageStore";

/**
 * Selector de idioma (botón 🌐 esquina superior izquierda).
 * languageStore es la ÚNICA fuente de verdad: no se duplica estado ni
 * lógica. Locales soportados: es / en (no añadir más en esta fase).
 */
const LANGS: Array<{ id: Lang; labelKey: string }> = [
  { id: "es", labelKey: "language.es" },
  { id: "en", labelKey: "language.en" },
];

export default function LanguagePanel() {
  const t = useT();
  const lang = useLanguageStore((s) => s.lang);
  const setLang = useLanguageStore((s) => s.setLang);

  return (
    <div className="ap-scroll">
      <p className="panel-subtitle">{t("language.subtitle")}</p>
      <div className="mp-list">
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`mp-item lp-option${lang === l.id ? " is-active" : ""}`}
            aria-pressed={lang === l.id}
            onClick={() => setLang(l.id)}
          >
            <span className="mp-icon">{l.id === "es" ? "🇪🇸" : "🇬🇧"}</span>
            <span className="mp-text">
              <b>{t(l.labelKey)}</b>
              <small>{l.id.toUpperCase()}</small>
            </span>
            {lang === l.id && <span className="lp-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
