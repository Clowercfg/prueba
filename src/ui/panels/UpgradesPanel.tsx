import { useUpgradesStore } from "../../game/stores/upgradesStore";
import { UPGRADE_BUILDINGS } from "../../game/config/upgradesConfig";
import { useT } from "../../game/stores/languageStore";

/**
 * Mejoras especiales (one-shot) de upgradesConfig: stable-speed y engordes
 * de pocilga. Precios/efectos verbatim de la config; la compra delega en
 * buySpecial (la cadena UPTEST permanece intacta).
 */

const money = (n: number) => `$${n.toFixed(2)}`;

export default function UpgradesPanel() {
  const t = useT();
  const specials = useUpgradesStore((s) => s.specials);
  const buySpecial = useUpgradesStore((s) => s.buySpecial);

  return (
    <div className="ap-scroll">
      <div className="iv-list">
        {UPGRADE_BUILDINGS.flatMap((building) =>
          building.specials.map((sp) => {
            const owned = specials[sp.id] === true;
            return (
              <div key={sp.id} className="row-card">
                <span className="rc-icon">{sp.icon}</span>
                <span className="rc-main">
                  <b>
                    {sp.name} <small className="rc-sub">({building.name})</small>
                  </b>
                  <small>{sp.description}</small>
                </span>
                {owned ? (
                  <span className="rc-max">✓</span>
                ) : (
                  <button type="button" className="ap-buy" onClick={() => void buySpecial(sp.id)}>
                    {money(sp.price)}
                  </button>
                )}
              </div>
            );
          }),
        )}
      </div>
      <p className="ap-hint">{t("panel.upgrades.hint_1")}</p>
    </div>
  );
}
