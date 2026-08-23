import { useVetStore } from "../../game/stores/vetStore";
import { getAnimalEconomy } from "../../game/config/economyConfig";

/**
 * Veterinario real: lista de animales enfermos/en recuperación desde
 * vetStore (alimentado por VetSystem). El coste y las horas de recuperación
 * salen de economyConfig vía el propio store al tratar; aquí sólo se muestran.
 * Sin timers: el restante se calcula en cada render (igual que CropsPanel).
 */

const money = (n: number) => `$${n.toFixed(2)}`;

function fmtLeft(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default function VetPanel() {
  const sick = useVetStore((s) => s.sick);
  const statusOf = useVetStore((s) => s.statusOf);
  const treat = useVetStore((s) => s.treat);
  const entries = Object.values(sick);

  return (
    <div className="ap-scroll">
      {entries.length === 0 ? (
        <p className="ap-empty">✅ Los corrales están sanos.</p>
      ) : (
        <div className="iv-list">
          {entries.map((e) => {
            const def = getAnimalEconomy(e.kind);
            const status = statusOf(e.id);
            return (
              <div key={e.id} className="row-card">
                <span className="rc-icon">{def?.icon ?? "🐾"}</span>
                <span className="rc-main">
                  <b>
                    {def?.name ?? e.kind} #{e.id}
                  </b>
                  {status === "sick" ? (
                    <>
                      <small className="vt-sick">🔴 Enfermo</small>
                      {def && (
                        <small>
                          Tratamiento {money(def.treatmentCost)} · Recuperación{" "}
                          {def.recoveryHours} h
                        </small>
                      )}
                    </>
                  ) : (
                    <small className="vt-rec">
                      🟡 En recuperación · quedan{" "}
                      {e.recoverAt ? fmtLeft(e.recoverAt - Date.now()) : "—"}
                    </small>
                  )}
                </span>
                {status === "sick" && (
                  <button type="button" className="ap-buy" onClick={() => treat(e.id)}>
                    Tratar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="ap-hint">
        En una granja de referencia (~20 animales) enferma 1 animal cada 9 días aproximadamente;
        cada animal solo puede enfermar como mínimo cada 14 días.
      </p>
    </div>
  );
}
