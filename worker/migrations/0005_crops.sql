-- 0005_crops.sql - Cosechas autoritativas en el servidor.
-- Inventario de semillas/cosechas + parcelas sembradas (crecimiento validado
-- por tiempo real) para que la venta de cosechas se valide server-side y
-- eche la cosecha del money-printer. ASCII puro.

CREATE TABLE player_crops (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  crop_id    TEXT    NOT NULL,
  seeds      INTEGER NOT NULL DEFAULT 0 CHECK (seeds >= 0),
  harvest    INTEGER NOT NULL DEFAULT 0 CHECK (harvest >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, crop_id)
);

CREATE TABLE player_crop_plots (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  plot_index INTEGER NOT NULL,
  crop_id    TEXT    NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  planted_at INTEGER NOT NULL,
  ready_at   INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, plot_index)
);
CREATE INDEX idx_crop_plots_user ON player_crop_plots(user_id);