import { useMemo, useState } from "react";
import { useFarmStore } from "../../game/stores/farmStore";
import { useVetStore } from "../../game/stores/vetStore";
import { useShopStore } from "../../game/stores/shopStore";
import { useGameStore } from "../../game/stores/gameStore";
import { ANIMAL_ECONOMY, getAnimalEconomy } from "../../game/config/economyConfig";
import { ENCLOSURE_BY_KIND } from "../../game/config/enclosuresConfig";
import { useT, t as tr } from "../../game/stores/languageStore";
import type { AnimalAgent, AnimalKind } from "../../game/types/entities";

/**
 * Panel de Animales (contenido). La cabecera con la X vive en PanelHost;
 * este componente SOLO consume estado real (farmStore/vetStore/shopStore)
 * y dispara acciones existentes. Sin lógica económica propia.
 */

const KINDS = Object.keys(ANIMAL_ECONOMY) as AnimalKind[];

const money = (n: number) => `$${n.toFixed(2)}`;

function HealthBar({ value }: { value: number }) {
  return (
    <div className="ap-bar" role="img" aria-label={`Salud ${Math.round(value)}%`}>
      <div
        className={`ap-bar-fill ${value > 60 ? "good" : value > 30 ? "warn" : "bad"}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function AnimalRow({ a }: { a: AnimalAgent }) {
  const t = useT();
  const treat = useVetStore((s) => s.treat);
  const select = useGameStore((s) => s.select);
  // Selection.id es string (uid); los agentes usan id numérico.
  const uid = String(a.id);
  const selectedId = useGameStore((s) =>
    s.selection && s.selection.kind === "animal" ? s.selection.id : null,
  );
  const status = useVetStore.getState().statusOf(a.id);
  const def = getAnimalEconomy(a.kind);

  const onSelect = () => {
    // Mismo seam que GameCanvas.handleFarmTap → estado compartido de selección.
    select({ kind: "animal", id: uid });
  };

  const onTreat = () => {
    if (!treat(a.id)) {
      // El propio store valida oro/estado; sin éxito no hay feedback extra.
      return;
    }
    onSelect();
  };

  return (
    <button type="button" className={`ap-row ${selectedId === uid ? "selected" : ""}`} onClick={onSelect}>
      <span className="ap-row-icon">{def?.icon ?? "🐾"}</span>
      <span className="ap-row-main">
        <span className="ap-name">{a.name}</span>
        <span className="ap-sub">
          {t(`animalState.${a.state}`)} · {t(`enclosure.${ENCLOSURE_BY_KIND[a.kind].id}`)}
        </span>
        <HealthBar value={a.health} />
        {status !== "healthy" && (
          <span className={`ap-chip ${status}`}>
            {status === "sick"
              ? tr("panel.vet.sick_badge")
              : tr("panel.vet.recovering_badge", { time: "" })
                  .replace(/[—-]\s*$/, "")
                  .trim()}
          </span>
        )}
      </span>
      {status === "sick" && def && (
        <span
          className="ap-treat"
          role="button"
          tabIndex={0}
          aria-label={`${tr("panel.vet.treat_btn")} ${money(def.treatmentCost)}`}
          onClick={(e) => {
            e.stopPropagation();
            onTreat();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onTreat();
            }
          }}
        >
          💊
        </span>
      )}
    </button>
  );
}

function KindGroup({
  kind,
  list,
}: {
  kind: AnimalKind;
  list: AnimalAgent[];
}) {
  const buyAnimal = useShopStore((s) => s.buyAnimal);
  const [notice, setNotice] = useState<string | null>(null);
  const def = getAnimalEconomy(kind)!;
  const enclosure = ENCLOSURE_BY_KIND[kind];
  const used = list.length;

  const avgHealth = useMemo(() => {
    if (list.length === 0) return null;
    return list.reduce((acc, a) => acc + a.health, 0) / list.length;
  }, [list]);

  const onBuy = () => {
    void buyAnimal(kind, 1).then((res) => setNotice(res.message));
  };

  return (
    <section className="ap-group">
      <header className="ap-group-head">
        <span className="ap-group-icon">{def.icon}</span>
        <span className="ap-group-title">
          <b>{tr(`animal.${kind}`)}</b>
          <small>
            {used}/{enclosure.capacity} · {tr(`feedPeriod.${def.feedPeriod === "día" ? "day" : "cycle"}`)}{" "}
            {money(def.feedCost)}
          </small>
        </span>
        <button type="button" className="ap-buy" onClick={onBuy}>
          {money(def.price)}
        </button>
      </header>

      {avgHealth !== null && <HealthBar value={avgHealth} />}
      <p className="ap-prod">{def.production}</p>
      {notice && <p className="ap-notice">{notice}</p>}

      {list.length === 0 ? (
        <p className="ap-none">{tr("panel.animals.empty")}</p>
      ) : (
        <div className="ap-list">
          {list.map((a) => (
            <AnimalRow key={a.id} a={a} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function AnimalsPanel() {
  const animals = useFarmStore((s) => s.animals);

  const groups = useMemo(() => {
    const byKind = new Map<AnimalKind, AnimalAgent[]>();
    for (const k of KINDS) byKind.set(k, []);
    for (const a of animals) {
      const arr = byKind.get(a.kind);
      if (arr) arr.push(a);
    }
    return byKind;
  }, [animals]);

  return (
    <div className="ap-scroll">
      <p className="ap-hint">{tr("panel.animals.hint")}</p>
      {KINDS.map((k) => (
        <KindGroup key={k} kind={k} list={groups.get(k)!} />
      ))}
    </div>
  );
}
