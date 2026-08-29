-- 0004_goods.sql - Inventario de productos autoritativo en el servidor.
-- Cierra el money-printer: las ventas se validan contra el stock real en D1
-- y se acreditan al precio del servidor (nunca confiando en el cliente).
-- ASCII puro (el parser de D1 falla con multibyte en comentarios).

-- Stock de productos del jugador (milk, eggs, meat, boiled-eggs).
CREATE TABLE player_goods (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  good_id    TEXT    NOT NULL,
  qty        INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, good_id)
);

-- Registro de animales por especie: solo crece con compras autenticadas o el
-- snapshot de import (una vez). last_produce_at limita la produccion server-side.
CREATE TABLE player_animals (
  user_id         INTEGER NOT NULL REFERENCES users(id),
  kind            TEXT    NOT NULL,
  count           INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  last_produce_at INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind)
);

-- Insumos de procesamiento YA consumidos cuyo output no se ha entregado todavia
-- (pool de reserva 1:1). La produccion de outputs queda acotada por esta reserva.
CREATE TABLE player_processing_pool (
  user_id INTEGER NOT NULL REFERENCES users(id),
  good_id TEXT    NOT NULL,
  qty     INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, good_id)
);