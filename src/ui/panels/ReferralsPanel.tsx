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

/**
 * Panel de REFERIDOS / AFILIADOS: codigo unico, registro de referido,
 * estadisticas de red e historial de comisiones.
 */

const STATUS_CLASS: Record<string, string> = {
  PENDING: "recovering",
  AVAILABLE: "harvested",
  REVERSED: "cancelled",
};

export default function ReferralsPanel() {
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
    } catch {
      /* sin backend */
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRegister = async (): Promise<void> => {
    if (!refInput.trim()) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.registerReferral(refInput.trim().toUpperCase());
      setMsg("¡Registro exitoso! Ya formas parte de la red.");
      setRefInput("");
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al registrar");
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
    <div className="ap-scroll">
      {status !== "authenticated" ? (
        <section className="ap-group">
          <p className="ap-empty">{t("affiliate.login_required")}</p>
        </section>
      ) : (
        <>
          {/* Codigo propio */}
          <section className="ap-group">
            <header className="ap-group-head">
              <span className="ap-group-icon">🔗</span>
              <span className="ap-group-title">
                <b>{t("affiliate.your_code")}</b>
              </span>
            </header>
            {code && (
              <div className="af-code-row">
                <code className="af-code">{code}</code>
                <button type="button" className="ap-buy" onClick={onCopy}>
                  {copied ? "✓" : "Copiar"}
                </button>
              </div>
            )}
          </section>

          {/* Registrar referido */}
          <section className="ap-group">
            <header className="ap-group-head">
              <span className="ap-group-icon">➕</span>
              <span className="ap-group-title">
                <b>{t("affiliate.register_referral")}</b>
              </span>
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

          {/* Estadisticas */}
          {stats && (
            <section className="ap-group">
              <header className="ap-group-head">
                <span className="ap-group-icon">📊</span>
                <span className="ap-group-title">
                  <b>{t("affiliate.stats")}</b>
                </span>
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

          {/* Arbol */}
          <section className="ap-group">
            <header className="ap-group-head">
              <span className="ap-group-icon">🌳</span>
              <span className="ap-group-title">
                <b>{t("affiliate.tree")}</b>
              </span>
            </header>
            {tree.length === 0 ? (
              <p className="ap-empty">Sin referidos todavía.</p>
            ) : (
              <div className="iv-list">
                {tree.map((r) => (
                  <div key={r.referred_id} className="row-card">
                    <span className="rc-icon">👤</span>
                    <span className="rc-main">
                      <b>{r.first_name ?? r.username ?? `#${r.referred_id}`}</b>
                      <small>
                        @{r.username ?? "sin_usuario"} · {r.children} sub-referido{r.children !== 1 ? "s" : ""}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Historial de comisiones */}
          <section className="ap-group">
            <header className="ap-group-head">
              <span className="ap-group-icon">💰</span>
              <span className="ap-group-title">
                <b>{t("affiliate.history")}</b>
              </span>
            </header>
            {commissions.length === 0 ? (
              <p className="ap-empty">Sin comisiones registradas.</p>
            ) : (
              <div className="iv-list">
                {commissions.map((c) => (
                  <div key={c.id} className="row-card">
                    <span className="rc-icon">💵</span>
                    <span className="rc-main">
                      <b>{fmtMoney(c.amount_minor)}</b>
                      <small>
                        Depósito {fmtMoney(c.deposit_minor)} de{" "}
                        {c.referred_name ?? c.referred_username ?? "alguien"} ·{" "}
                        <span className={STATUS_CLASS[c.status] ?? ""}>
                          {c.status}
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

      <p className="ap-hint">
        Comparte tu código con amigos. Cuando realicen un depósito, ganas una
        comisión del 5% sobre el monto depositado. Las comisiones quedan
        pendientes hasta que el depósito sea aprobado por un administrador.
      </p>
    </div>
  );
}
