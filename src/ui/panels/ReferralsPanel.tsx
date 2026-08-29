import { useCallback, useEffect, useState } from "react";
import {
  api,
  fmtMoney,
  ApiError,
  type ReferralStats,
  type ReferralTreeRow,
  type ReferralCommissionRow,
} from "../../game/api/client";
import { useT } from "../../game/stores/languageStore";
import { useAuthStore } from "../../game/stores/authStore";

const STATUS_CLASS: Record<string, string> = {
  PENDING: "recovering",
  AVAILABLE: "harvested",
  REVERSED: "cancelled",
};

/** Contenido de referidos (reutilizable). Sin wrapper de scroll, para
 *  embeberlo en el panel de Perfil bajo la información personal o como
 *  panel independiente (ReferralsPanel). */
export function ReferralsContent() {
  const t = useT();
  const status = useAuthStore((s) => s.status);
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [tree, setTree] = useState<ReferralTreeRow[]>([]);
  const [commissions, setCommissions] = useState<ReferralCommissionRow[]>([]);
  const [refInput, setRefInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const [codeRes, statsRes, treeRes, commRes] = await Promise.all([
        api.referralCode(),
        api.referralStats(),
        api.referralTree(),
        api.referralCommissions(),
      ]);
      setCode(codeRes.code);
      setStats(statsRes);
      setTree(treeRes.items);
      setCommissions(commRes.items);
    } catch { /* */ }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const onRegister = async (): Promise<void> => {
    if (!refInput.trim()) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.registerReferral(refInput.trim().toUpperCase());
      setMsg(t("affiliate.register_success"));
      setRefInput("");
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("affiliate.error.network_error"));
    } finally {
      setBusy(false);
    }
  };

  const onCopy = (): void => {
    if (code) {
      void navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      {status !== "authenticated" ? (
        <section className="ap-group">
          <p className="ap-empty">{t("affiliate.login_required")}</p>
        </section>
      ) : (
        <>
          <section className="ap-group">
            <header className="ap-group-head">
              <span className="ap-group-icon">🔗</span>
              <span className="ap-group-title"><b>{t("affiliate.your_code")}</b></span>
            </header>
            {code && (
              <div className="af-code-row">
                <code className="af-code">{code}</code>
                <button type="button" className="ap-buy" onClick={onCopy}>
                  {copied ? "✓" : t("affiliate.copy_btn")}
                </button>
              </div>
            )}
          </section>

          <section className="ap-group">
            <header className="ap-group-head">
              <span className="ap-group-icon">➕</span>
              <span className="ap-group-title"><b>{t("affiliate.register_referral")}</b></span>
            </header>
            <div className="dp-form">
              <input
                className="dp-input"
                type="text"
                placeholder={t("affiliate.code_placeholder")}
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                maxLength={20}
              />
              {error && <p className="dp-error">{error}</p>}
              {msg && <p className="dp-success">{msg}</p>}
              <button
                type="button"
                className="ap-buy dp-submit"
                disabled={busy || !refInput.trim()}
                onClick={() => void onRegister()}
              >
                {busy ? "..." : t("affiliate.register_btn")}
              </button>
            </div>
          </section>

          {stats && (
            <section className="ap-group">
              <header className="ap-group-head">
                <span className="ap-group-icon">📊</span>
                <span className="ap-group-title"><b>{t("affiliate.stats")}</b></span>
              </header>
              <div className="af-stats-grid">
                <div className="af-stat">
                  <span className="af-stat-value">{stats.directReferrals}</span>
                  <span className="af-stat-label">{t("affiliate.direct_referrals")}</span>
                </div>
                <div className="af-stat">
                  <span className="af-stat-value">{stats.totalNetwork}</span>
                  <span className="af-stat-label">{t("affiliate.total_network")}</span>
                </div>
                <div className="af-stat">
                  <span className="af-stat-value">{fmtMoney(stats.pending)}</span>
                  <span className="af-stat-label">{t("affiliate.pending")}</span>
                </div>
                <div className="af-stat">
                  <span className="af-stat-value">{fmtMoney(stats.available)}</span>
                  <span className="af-stat-label">{t("affiliate.available")}</span>
                </div>
                <div className="af-stat af-stat-wide">
                  <span className="af-stat-value">{fmtMoney(stats.totalEarned)}</span>
                  <span className="af-stat-label">{t("affiliate.total_earned")}</span>
                </div>
              </div>
            </section>
          )}

          <section className="ap-group">
            <header className="ap-group-head">
              <span className="ap-group-icon">🌳</span>
              <span className="ap-group-title"><b>{t("affiliate.tree")}</b></span>
            </header>
            {tree.length === 0 ? (
              <p className="ap-empty">{t("affiliate.no_referrals")}</p>
            ) : (
              <div className="iv-list">
                {tree.map((r) => (
                  <div key={r.referred_id} className="row-card">
                    <span className="rc-icon">👤</span>
                    <span className="rc-main">
                      <b>{r.first_name ?? r.username ?? `#${r.referred_id}`}</b>
                      <small>
                        @{r.username ?? t("affiliate.someone")} · {r.children} {t("affiliate.sub_referral")}{r.children !== 1 ? "s" : ""}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="ap-group">
            <header className="ap-group-head">
              <span className="ap-group-icon">💰</span>
              <span className="ap-group-title"><b>{t("affiliate.history")}</b></span>
            </header>
            {commissions.length === 0 ? (
              <p className="ap-empty">{t("affiliate.no_commissions")}</p>
            ) : (
              <div className="iv-list">
                {commissions.map((c) => (
                  <div key={c.id} className="row-card">
                    <span className="rc-icon">💵</span>
                    <span className="rc-main">
                      <b>{fmtMoney(c.amount_minor)}</b>
                      <small>
                        {t("affiliate.deposit_of", { v: fmtMoney(c.deposit_minor) })} ·{" "}
                        {t("affiliate.from_user", { v: c.referred_name ?? c.referred_username ?? t("affiliate.someone") })} ·{" "}
                        <span className={STATUS_CLASS[c.status] ?? ""}>
                          {t(`affiliate.status.${c.status}`) ?? c.status}
                        </span>
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <p className="ap-hint">{t("affiliate.hint")}</p>
    </>
  );
}

export default function ReferralsPanel() {
  return (
    <div className="ap-scroll">
      <ReferralsContent />
    </div>
  );
}
