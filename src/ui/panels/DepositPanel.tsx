import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney, ApiError, type DepositConfig, type MyDepositRow } from "../../game/api/client";
import { useT, useLanguageStore, localeFor } from "../../game/stores/languageStore";
import { useAuthStore } from "../../game/stores/authStore";
import { useWalletStore } from "../../game/stores/walletStore";

/**
 * Apartado de DEPÓSITOS — portado del proyecto anterior (granja-inmersiva)
 * con el mismo diseño (red + wallet + contacto Telegram + instrucciones) y
 * adaptado al backend actual: además registra la intención de depósito
 * (POST /api/wallet/deposits → PENDING) y lista el historial propio.
 * El dinero se acredita SOLO cuando un admin aprueba el depósito.
 */

const STATUS_CLASS: Record<string, string> = {
  PENDING: "recovering",
  APPROVED: "good",
  COMPLETED: "harvested",
  CANCELLED: "cancelled",
  DENIED: "cancelled",
};

export function DepositPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLanguageStore((s) => s.lang);
  const status = useAuthStore((s) => s.status);
  const usdtMinor = useWalletStore((s) => s.usdtMinor);
  const [config, setConfig] = useState<DepositConfig | null>(null);
  const [deposits, setDeposits] = useState<MyDepositRow[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [sentId, setSentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usd = Number(amount.replace(",", "."));
  const amountMinor = Number.isFinite(usd) && usd > 0 ? Math.round(usd * 100) : 0;
  const canSubmit = status === "authenticated" && amountMinor > 0 && !busy;

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await api.depositConfig());
    } catch {
      /* sin backend: la UI muestra los placeholders */
    }
  }, []);

  const loadDeposits = useCallback(async () => {
    if (useAuthStore.getState().status !== "authenticated") return;
    try {
      const data = await api.myDeposits();
      setDeposits(data.items);
    } catch {
      /* historial no disponible */
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadDeposits();
  }, [loadConfig, loadDeposits]);

  const copyText = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    });
  };

  const openTelegram = () => {
    if (config?.telegram) {
      const username = config.telegram.replace("@", "");
      window.open(`https://web.telegram.org/k/#@${username}`, "_blank", "noopener,noreferrer");
    }
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.createDeposit(amountMinor, reference.trim() || undefined);
      setSentId(r.id);
      setAmount("");
      setReference("");
      void loadDeposits();
    } catch (err) {
      setError(err instanceof ApiError ? `${err.status}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deposit-backdrop" onClick={onClose}>
      <div className="deposit-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="deposit-close" onClick={onClose} aria-label={t("panel.close_aria")}>
          ✕
        </button>

        <div className="deposit-header">
          <div className="deposit-header-icon">💰</div>
          <h2>{t("deposit.title")}</h2>
          <p className="deposit-subtitle">{t("deposit.subtitle")}</p>
        {status === "authenticated" && (
          <p className="deposit-balance">
            {t("deposit.balance")}: <b>{fmtMoney(usdtMinor)}</b>
          </p>
        )}
        </div>

        <div className="deposit-info">
          <div className="deposit-field">
            <label>{t("deposit.network")}</label>
            <div className="deposit-value">{config?.network || "…"}</div>
          </div>

          <div className="deposit-field">
            <label>{t("deposit.wallet")}</label>
            <div className="deposit-value-row">
              <span className="deposit-address">{config?.walletAddress || "…"}</span>
              {config?.walletAddress && (
                <button type="button" className="deposit-copy" onClick={() => copyText(config.walletAddress, "wallet")}>
                  {copied === "wallet" ? "✓" : "📋"}
                </button>
              )}
            </div>
          </div>

          <div className="deposit-field">
            <label>{t("deposit.telegram_contact")}</label>
            <div className="deposit-value-row">
              <span className="deposit-address">{config?.telegram || "…"}</span>
              {config?.telegram && (
                <button type="button" className="deposit-copy" onClick={() => copyText(config.telegram, "tg")}>
                  {copied === "tg" ? "✓" : "📋"}
                </button>
              )}
            </div>
          </div>
        </div>

        {config?.telegram && (
          <button type="button" className="deposit-telegram-btn" onClick={openTelegram}>
            📱 {t("deposit.contact_telegram")}
          </button>
        )}

        <div className="deposit-instructions">
          <p>{t("deposit.instructions")}</p>
          <ul>
            <li>{t("deposit.instr_user")}</li>
            <li>{t("deposit.instr_amount")}</li>
            <li>{t("deposit.instr_network")}</li>
            <li>{t("deposit.instr_tx")}</li>
          </ul>
          <p className="deposit-note">{t("deposit.note")}</p>
        </div>

        {status === "authenticated" ? (
          <form className="deposit-form" onSubmit={(e) => void submit(e)}>
            <h3>{t("deposit.reg_title")}</h3>
            {sentId !== null && <p className="deposit-ok">{t("deposit.sent_ok").replace("{id}", String(sentId))}</p>}
            {error && <p className="deposit-err">{error}</p>}
            <label className="deposit-form-field">
              <span>{t("deposit.amount")}</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="10.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="deposit-form-field">
              <span>{t("deposit.reference")}</span>
              <input
                type="text"
                placeholder="0x…"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <button type="submit" className="deposit-submit" disabled={!canSubmit}>
              {busy ? "…" : t("deposit.submit")}
            </button>
          </form>
        ) : (
          <p className="deposit-note deposit-auth-note">{t("deposit.need_auth")}</p>
        )}

        <div className="deposit-history">
          <h3>{t("deposit.mine")}</h3>
          {status !== "authenticated" || deposits.length === 0 ? (
            <p className="deposit-note">{t("deposit.none")}</p>
          ) : (
            <div className="deposit-list">
              {deposits.map((d) => (
                <div key={d.id} className="deposit-item">
                  <div className="deposit-item-main">
                    <span className="deposit-item-amount">{fmtMoney(d.amountMinor)}</span>
                    <span className="deposit-item-currency">{d.currency}</span>
                    <span className={`ap-chip ${STATUS_CLASS[d.status] ?? "recovering"}`}>{d.status}</span>
                  </div>
                  <div className="deposit-item-meta">
                    <span>{d.method}</span>
                    <span>{new Date(d.createdAt).toLocaleString(localeFor(lang))}</span>
                  </div>
                  {d.reference && (
                    <div className="deposit-item-tx" title={d.reference}>
                      TX: {d.reference.slice(0, 16)}
                      {d.reference.length > 16 ? "…" : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
