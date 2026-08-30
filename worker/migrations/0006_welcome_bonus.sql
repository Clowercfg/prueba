-- 0006_welcome_bonus.sql - bono de bienvenida: 1 gallina gratis por cuenta.
-- NOTA: ASCII puro por el parser de migraciones de D1 (ver 0001).
-- Flag idempotente en users: 0 = pendiente de reclamar, 1 = ya reclamado.
-- El bono se concede via player_animals (tabla ya existente); aqui solo se
-- registra quien ya lo reclamo para que el cartel no vuelva a aparecer.

ALTER TABLE users ADD COLUMN welcome_bonus_claimed INTEGER NOT NULL DEFAULT 0;