-- 0002_add_last_name.sql - campo de identidad basico del perfil de Telegram.
-- NOTA: es ASCII puro por el parser de migraciones de D1.
-- El dinero NO vive aqui: los fondos del usuario ya tienen tabla propia
-- (wallets.available_minor), unico origen de verdad; duplicarlo en
-- users.balance violaria la regla anti-duplicacion y el alcance actual
-- (sin depositos/pagos en esta fase).

ALTER TABLE users ADD COLUMN last_name TEXT;
