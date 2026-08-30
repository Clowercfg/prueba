import { useState } from "react";
import { api, ApiError } from "../../game/api/client";
import { useT } from "../../game/stores/languageStore";
import { useFarmStore } from "../../game/stores/farmStore";
import { createAnimalAgent } from "../../game/utils/animalSpawn";
import { animalName } from "../../game/stores/shopStore";

/**
 * Cartel del bono de bienvenida: 1 gallina gratis por cuenta.
 * Aparece al autenticarse PREGUNTANDO al servidor si el usuario ya lo
 * reclamó. Al reclamar, el backend concede la gallina (idempotente) y aquí
 * se añade el agente al corral local para verla en la granja.
 */
export function WelcomeBonusPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  async function claim(): Promise<void> {
    if (busy || claimed) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.welcomeBonusClaim();
      if (r.granted) {
        useFarmStore.getState().registerAnimal(createAnimalAgent("chicken", animalName("chicken")));
        setClaimed(true);
      } else {
        // Ya lo tenía reclamado (doble clic/recarga): no mostrar más.
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiError ? `${err.status}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deposit-backdrop" onClick={claimed ? onClose : undefined}>
      <div className="deposit-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="deposit-close" onClick={onClose} aria-label={t("panel.close_aria")}>
          ✕
        </button>
        <div className="deposit-header">
          <div className="deposit-header-icon">🐔</div>
          <h2>{t("welcome.title")}</h2>
          <p className="deposit-subtitle">{claimed ? t("welcome.claimed") : t("welcome.subtitle")}</p>
        </div>
        {error && <p className="deposit-err">{error}</p>}
        {claimed ? (
          <button type="button" className="deposit-submit" onClick={onClose}>
            {t("welcome.dismiss")}
          </button>
        ) : (
          <button
            type="button"
            className="deposit-submit"
            onClick={() => void claim()}
            disabled={busy}
          >
            {busy ? t("welcome.claiming") : t("welcome.claim")}
          </button>
        )}
      </div>
    </div>
  );
}