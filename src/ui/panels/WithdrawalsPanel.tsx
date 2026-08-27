import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney, ApiError, type MyWithdrawalRow } from "../../game/api/client";
import { useT } from "../../game/stores/languageStore";
import { useAuthStore } from "../../game/stores/authStore";
import { useWalletStore } from "../../game/stores/walletStore";

/**
 * Panel de RETIROS: el usuario solicita retirar USDT del wallet.
 * La solicitud queda PENDING y un admin la aprueba/deniega.
 * Los fondos se RESERVA al crear la solicitud (no desaparecen del saldo
 * visible, pero tampoco se pueden gastar dos veces).
 */

const METHODS = ["USDT (BEP20)", "USDT (ERC20)", "USDT (TRC20)"];

const STATUS_CLASS: Record<string, string> = {
  PENDING: "recovering",
  UNDER_REVIEW: "recovering",
  APPROVED: "good",
  PROCESSING: "good",
  COMPLETED: "harvested",
  DENIED: "cancelled",
  CANCELLED: "cancelled",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  UNDER_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  PROCESSING: "Procesando",
  COMPLETED: "Completado",
  DENIED: "Denegado",
  CANCELLED: "Cancelado",
};

export default function WithdrawalsPanel() {
  const t = useT();
  const status = useAuthStore((s) => s.status);
  const usdtMinor = useWalletStore((s) => s.usdtMinor);
  const [method, setMethod] = useState(METHODS[0]);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [history, setHistory] = useState<MyWithdrawalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usd = Number(amount.replace(",", "."));
  const amountMinor = Number.isFinite(usd) && usd > 0 ? Math.round(usd * 100) : 0;
  const canSubmit = status === "authenticated" && amountMinor > 0 && destination.length >= 8 && !busy;

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.myWithdrawals();
      setHistory(data.items);
    } catch {
      /* sin backend */
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const onSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.createWithdrawal(amountMinor, method, destination);
      setSuccess(`Solicitud #${res.id} registrada: fondos reservados. Se procesará tras verificación.`);
      setAmount("");
      setDestination("");
      void loadHistory();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear la solicitud");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ap-scroll">
      <section className="ap-group">
        <header className="ap-group-head">
          <span className="ap-group-icon">💸</span>
          <span className="ap-group-title">
            <b>Solicitar retiro</b>
            <small>Retira USDT de tu wallet a una dirección externa</small>
          </span>
        </header>

        {status !== "authenticated" ? (
          <p className="ap-empty">{t("deposit.need_auth")}</p>
        ) : (
          <>
            <p className="ap-prod">
              Saldo disponible: <b>{fmtMoney(usdtMinor)}</b>
            </p>

            <div className="dp-form">
              <label className="dp-label">
                Red / Método
                <select
                  className="dp-input"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>

              <label className="dp-label">
                Dirección de wallet destino
                <input
                  className="dp-input"
                  type="text"
                  placeholder="0x... / TX..."
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  maxLength={200}
                />
              </label>

              <label className="dp-label">
                Monto a retirar (USD)
                <input
                  className="dp-input"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>

              {error && <p className="dp-error">{error}</p>}
              {success && <p className="dp-success">{success}</p>}

              <button
                type="button"
                className="ap-buy dp-submit"
                disabled={!canSubmit}
                onClick={() => void onSubmit()}
              >
                {busy ? "Procesando..." : "Solicitar retiro"}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="ap-group">
        <header className="ap-group-head">
          <span className="ap-group-icon">📋</span>
          <span className="ap-group-title">
            <b>Historial de retiros</b>
          </span>
        </header>
        {history.length === 0 ? (
          <p className="ap-empty">Sin retiros registrados.</p>
        ) : (
          <div className="iv-list">
            {history.map((w) => (
              <div key={w.id} className="row-card">
                <span className="rc-icon">💸</span>
                <span className="rc-main">
                  <b>{fmtMoney(w.amountMinor)} · {w.method}</b>
                  <small>
                    {w.destinationMasked} ·{" "}
                    <span className={STATUS_CLASS[w.status] ?? ""}>
                      {STATUS_LABEL[w.status] ?? w.status}
                    </span>
                  </small>
                  {w.denyReason && (
                    <small className="cancelled">Motivo: {w.denyReason}</small>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="ap-hint">
        Al solicitar un retiro se reservan los fondos automáticamente. Un
        administrador revisará y procesará tu solicitud. Si es denegada, los
        fondos reservados vuelven a tu saldo disponible.
      </p>
    </div>
  );
}
