-- 0001_init.sql - Harvest Valley: roles, wallet con ledger idempotente,
-- depositos/retiros moderables, auditoria admin y notificaciones globales.
-- NOTA: este archivo es ASCII puro porque el parser de migraciones de D1
-- falla con caracteres multibyte dentro de comentarios.
-- Dinero SIEMPRE en unidades menores enteras (minor units).

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id   TEXT    NOT NULL UNIQUE,
  username      TEXT,
  first_name    TEXT,
  language_code TEXT    NOT NULL DEFAULT 'es',
  role          TEXT    NOT NULL DEFAULT 'USER'
                CHECK (role IN ('USER','ADMIN','SUPER_ADMIN')),
  status        TEXT    NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE','BLOCKED')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE wallets (
  user_id         INTEGER NOT NULL REFERENCES users(id),
  currency        TEXT    NOT NULL DEFAULT 'USD',
  available_minor INTEGER NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  reserved_minor  INTEGER NOT NULL DEFAULT 0 CHECK (reserved_minor  >= 0),
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (user_id, currency)
);

CREATE TABLE deposits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency     TEXT    NOT NULL DEFAULT 'USD',
  method       TEXT    NOT NULL DEFAULT 'MANUAL_CRYPTO',
  reference    TEXT,
  source       TEXT    NOT NULL DEFAULT 'MANUAL'
               CHECK (source IN ('MANUAL','PROVIDER_VERIFIED')),
  status       TEXT    NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','UNDER_REVIEW','COMPLETED','CANCELLED')),
  created_at   INTEGER NOT NULL,
  processed_at INTEGER,
  processed_by INTEGER REFERENCES users(id)
);

CREATE TABLE withdrawals (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id),
  amount_minor       INTEGER NOT NULL CHECK (amount_minor > 0),
  currency           TEXT    NOT NULL DEFAULT 'USD',
  method             TEXT    NOT NULL,
  destination_masked TEXT    NOT NULL,
  deny_reason        TEXT,
  status             TEXT    NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','UNDER_REVIEW','APPROVED',
                                       'PROCESSING','COMPLETED','DENIED','CANCELLED')),
  created_at         INTEGER NOT NULL,
  processed_at       INTEGER,
  processed_by       INTEGER REFERENCES users(id)
);

CREATE TABLE wallet_ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  type         TEXT    NOT NULL,
  direction    TEXT    NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency     TEXT    NOT NULL DEFAULT 'USD',
  source_type  TEXT    NOT NULL,
  source_id    INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  -- Idempotencia financiera: una sola entrada por operacion fuente/tipo
  UNIQUE (type, source_type, source_id)
);
CREATE INDEX idx_ledger_user   ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX idx_ledger_source ON wallet_ledger(source_type, source_id);

CREATE TABLE admin_audit_log (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id         INTEGER NOT NULL REFERENCES users(id),
  action                TEXT    NOT NULL,
  target_user_id        INTEGER REFERENCES users(id),
  target_transaction_id INTEGER,
  old_status            TEXT,
  new_status            TEXT,
  amount_minor          INTEGER,
  currency              TEXT,
  reason                TEXT,
  metadata              TEXT,
  created_at            INTEGER NOT NULL
);
CREATE INDEX idx_audit_action ON admin_audit_log(action, created_at DESC);
CREATE INDEX idx_audit_admin  ON admin_audit_log(admin_user_id, created_at DESC);

CREATE TABLE notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'GENERAL'
              CHECK (type IN ('GENERAL','WARNING','SYSTEM','WEATHER','ECONOMY','MAINTENANCE')),
  priority    TEXT    NOT NULL DEFAULT 'NORMAL'
              CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  target_type TEXT    NOT NULL DEFAULT 'ALL_USERS',
  starts_at   INTEGER,
  expires_at  INTEGER,
  created_by  INTEGER NOT NULL REFERENCES users(id),
  sent_at     INTEGER,
  created_at  INTEGER NOT NULL
);

-- Estado READ/UNREAD por usuario (nunca global)
CREATE TABLE notification_receipts (
  notification_id INTEGER NOT NULL REFERENCES notifications(id),
  user_id         INTEGER NOT NULL REFERENCES users(id),
  read_at         INTEGER,
  PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX idx_receipts_unread ON notification_receipts(user_id) WHERE read_at IS NULL;

-- Rate limiting de ventana fija (auth y acciones financieras admin)
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
