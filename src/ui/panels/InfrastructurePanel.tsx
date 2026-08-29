import { useMemo } from "react";
import { useUpgradesStore } from "../../game/stores/upgradesStore";
import { useFarmStore } from "../../game/stores/farmStore";
import {
  UPGRADE_BUILDINGS,
} from "../../game/config/upgradesConfig";
import type { AnimalKind } from "../../game/types/entities";
import { useT } from "../../game/stores/languageStore";

/**
 * Infraestructura real: niveles/capacidades de UPGRADES_ECONOMY vía
 * upgradesStore y ocupación real de corrales desde farmStore.
 * La compra delega en buyLevel (orden nivel a nivel, precios intactos).
 */

const money = (n: number) => `$${n.toFixed(2)}`;

const KIND_BY_BUILDING: Record<string, AnimalKind[]> = {
  coop: ["chicken"],
  stable: ["cow"],
  pigPen: ["pig"],
};

export default function InfrastructurePanel() {
  const t = useT();
  const levels = useUpgradesStore((s) => s.levels);
  const buyLevel = useUpgradesStore((s) => s.buyLevel);
  const capacityOf = useUpgradesStore((s) => s.capacityOf);
  const nextLevelOf = useUpgradesStore((s) => s.nextLevelOf);
  // Suscripción estable a la lista; el conteo por especie se deriva con useMemo
  // (un selector que crea objeto nuevo provocaría re-render infinito en Zustand).
  const animals = useFarmStore((s) => s.animals);
  const usedByKind = useMemo(() => {
    const out: Partial<Record<AnimalKind, number>> = {};
    for (const a of animals) out[a.kind] = (out[a.kind] ?? 0) + 1;
    return out;
  }, [animals]);

  return (
    <div className="ap-scroll">
      <div className="iv-list">
        {UPGRADE_BUILDINGS.map((def) => {
          const level = levels[def.id] ?? def.startLevel;
          const capacity = capacityOf(def.id);
          const next = nextLevelOf(def.id);
          const kinds = KIND_BY_BUILDING[def.id];
          const used = kinds ? kinds.reduce((a, k) => a + (usedByKind[k] ?? 0), 0) : null;
          return (
            <div key={def.id} className="row-card">
              <span className="rc-icon">{def.icon}</span>
              <span className="rc-main">
                <b>
                  {def.name} · {t("panel.infrastructure.level_short", { level: String(level) })}
                </b>
                <small>
                  {t("panel.infrastructure.capacity_line", { cap: String(capacity), unit: def.unit })}
                  {used !== null ? ` ${t("panel.infrastructure.in_use", { used: String(used) })}` : ""}
                </small>
                {next && (
                  <small>
                    {t("panel.infrastructure.next_line", { level: String(next.level) })}
                    {next.capacity !== undefined ? ` → ${next.capacity} ${def.unit}` : ""} ·{" "}
                    {money(next.price)}
                  </small>
                )}
              </span>
              {next ? (
                <button type="button" className="ap-buy" onClick={() => void buyLevel(def.id)}>
                  {t("panel.upgrades.buy")}
                </button>
              ) : (
                <span className="rc-max">{t("panel.upgrades.max")}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
