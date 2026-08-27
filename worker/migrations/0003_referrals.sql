-- 0003_referrals.sql - Sistema de referidos: codigo por usuario,
-- relaciones padre-hijo y comisiones por deposito referido.

-- Codigo de afiliado unico por usuario (generado server-side).
CREATE TABLE referral_codes (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),
  code       TEXT    NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- Relacion de referido: quien referio a quien.
CREATE TABLE referrals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL REFERENCES users(id),
  referred_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  level       INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);

-- Comisiones generadas por depositos de referidos.
CREATE TABLE referral_commissions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  referred_user_id INTEGER NOT NULL REFERENCES users(id),
  deposit_id      INTEGER NOT NULL REFERENCES deposits(id),
  deposit_minor   INTEGER NOT NULL,
  pct_bps         INTEGER NOT NULL,
  amount_minor    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','AVAILABLE','REVERSED')),
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_commissions_user ON referral_commissions(user_id, created_at DESC);
