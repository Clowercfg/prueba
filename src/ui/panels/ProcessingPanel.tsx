import { useState } from "react";
import { useProcessingStore } from "../../game/stores/processingStore";
import { useGoodsStore } from "../../game/stores/goodsStore";
import { useUpgradesStore } from "../../game/stores/upgradesStore";
import { PROCESS_LIST } from "../../game/config/processingConfig";
import { getGoodsEconomy } from "../../game/config/economyConfig";
import { getProcessorLevelDef } from "../../game/config/upgradesConfig";

/**
 * Panel de Procesamiento (contenido). Sólo consume estado real
 * (processingStore/goodsStore/upgradesStore) y acciones existentes
 * (startProcess/addToJob). Sin timers: los snapshots se refrescan cuando
 * el store cambia (ProcessingSystem hace tick cada 1 s).
 */

const money = (n: number) => `$${n.toFixed(2)}`;

function fmtRemaining(endTime: number): string {
  const msLeft = Math.max(0, endTime - Date.now());
  const totalSec = Math.ceil(msLeft / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function JobRow({ jobId }: { jobId: string }) {
  const addToJob = useProcessingStore((s) => s.addToJob);
  const jobs = useProcessingStore((s) => s.jobs);
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return null;

  const out = getGoodsEconomy(job.outputGoodId);
  const span = Math.max(1, job.endTime - job.startTime);
  const progress = Math.min(1, Math.max(0, (Date.now() - job.startTime) / span));
  const running = Date.now() < job.endTime;

  return (
    <div className="ap-row cp-row-static">
      <span className="ap-row-icon">{out?.icon ?? "🍳"}</span>
      <span className="ap-row-main">
        <span className="ap-name">
          {out?.name ?? job.outputGoodId} ×{job.qty}
        </span>
        <div className="ap-bar">
          <div
            className={`ap-bar-fill ${progress >= 1 ? "good" : "warn"}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        {running && (
          <span className="cp-remaining">Falta {fmtRemaining(job.endTime)}</span>
        )}
      </span>
      {running && (
        <button type="button" className="cp-harvest" onClick={() => addToJob(job.id)}>
          +1
        </button>
      )}
    </div>
  );
}

export default function ProcessingPanel() {
  const [notice, setNotice] = useState<string | null>(null);
  const level = useUpgradesStore((s) => s.levels.processing);
  const jobs = useProcessingStore((s) => s.jobs);
  const inventory = useGoodsStore((s) => s.inventory);
  const canProcess = useProcessingStore((s) => s.canProcess);
  const startProcess = useProcessingStore((s) => s.startProcess);
  const locked = level <= 0;
  const def = locked ? null : getProcessorLevelDef(level);

  const maxQtyFor = (recipeId: string): number => {
    // Busca la mayor cantidad válida usando SOLO la validación oficial.
    for (let q = def?.capacity ?? 1; q >= 1; q--) {
      if (canProcess(recipeId, q).ok) return q;
    }
    return 0;
  };

  const onStart = (recipeId: string, qty: number): void => {
    if (!startProcess(recipeId, qty)) setNotice("No se pudo iniciar el proceso.");
    else setNotice(null);
  };

  return (
    <div className="ap-scroll">
      <section className="ap-group">
        <header className="ap-group-head">
          <span className="ap-group-icon">⚙️</span>
          <span className="ap-group-title">
            <b>Procesadora</b>
            <small>
              {locked
                ? "No construida"
                : `Nivel ${level} · Capacidad ${def!.capacity} · ${def!.processHours} h/ud · ${money(def!.costPerEgg)}/ud`}
            </small>
          </span>
          {!locked && <span className="ap-chip recovering">Nv. {level}</span>}
        </header>
        {locked && (
          <p className="ap-notice">Construye la Procesadora en Más → Infraestructura.</p>
        )}
      </section>

      {jobs.length > 0 && (
        <section className="ap-group">
          <header className="ap-group-head">
            <span className="ap-group-icon">⏳</span>
            <span className="ap-group-title">
              <b>En proceso</b>
              <small>{jobs.length} trabajo(s)</small>
            </span>
          </header>
          <div className="ap-list">
            {jobs.map((j) => (
              <JobRow key={j.id} jobId={j.id} />
            ))}
          </div>
        </section>
      )}

      {notice && <p className="ap-notice">{notice}</p>}

      {PROCESS_LIST.map((r) => {
        const inp = getGoodsEconomy(r.inputGoodId);
        const out = getGoodsEconomy(r.outputGoodId);
        const maxQty = locked ? 0 : maxQtyFor(r.id);
        const inputStock = inventory[r.inputGoodId] ?? 0;
        return (
          <section className="ap-group" key={r.id}>
            <header className="ap-group-head">
              <span className="ap-group-icon">{inp?.icon ?? "🥚"}</span>
              <span className="ap-group-title">
                <b>
                  {inp?.name ?? r.input.productId} → {out?.name ?? r.output.productId}
                </b>
                <small>
                  Stock: {inputStock} {r.machine}
                </small>
              </span>
            </header>
            <p className="ap-prod">
              {r.input.qty} huevo por {r.output.qty} producto · {def ? `${def.processHours} h/ud · ${money(def.costPerEgg)}/ud` : "—"}
            </p>
            <div className="cp-actions">
              <button
                type="button"
                className="ap-buy"
                disabled={locked || maxQty < 1}
                onClick={() => onStart(r.id, 1)}
              >
                Procesar 1
              </button>
              <button
                type="button"
                className="cp-sell"
                disabled={maxQty < 2}
                onClick={() => onStart(r.id, maxQty)}
              >
                Máx ({maxQty})
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
