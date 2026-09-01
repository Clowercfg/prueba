/**
 * Operaciones financieras sobre el ledger. TODAS son atómicas (db.batch es
 * una transacción en D1) e idempotentes gracias al UNIQUE(type, source_type,
 * source_id) de wallet_ledger. Nunca se toca el balance sin entrada de libro.
 *
 * Truco transaccional: los UPDATE de wallets NO filtran por saldo suficiente;
 * si el saldo quedaría negativo, el CHECK de la tabla falla, el batch entero
 * hace rollback y mapeamos el error a un HTTP limpio.
 */

import type { Env } from '../env'
import { HttpError } from '../auth'

export class FinancialConflict extends HttpError {
  constructor(message: string) {
    super(409, message)
  }
}

export interface MoneyOp {
  userId: number
  currency?: string
  amountMinor: number
  sourceType: string
  sourceId: number
}

const now = () => Date.now()

function mapSqliteError(e: unknown, op: string): never {
  const msg = String((e as Error)?.message ?? e)
  if (msg.includes('UNIQUE')) throw new FinancialConflict(`${op}: ya procesado (idempotencia)`)
  if (msg.includes('CHECK')) {
    if (op === 'WITHDRAWAL_RESERVE' || op === 'ADMIN_ADJUSTMENT_DEBIT') throw new HttpError(400, 'Saldo disponible insuficiente')
    throw new HttpError(409, `${op}: fondos reservados inconsistentes`)
  }
  throw e instanceof Error ? e : new Error(msg)
}

/**
 * Crea el retiro reservando fondos: disponible −X, reservado +X.
 * Orden seguro: primero la fila PENDING (fuente de verdad), luego la reserva
 * atómica con su entrada de libro; si el saldo no alcanza, el CHECK rompe el
 * batch y compensamos dejando el retiro CANCELLED por fondos insuficientes.
 */
export async function createWithdrawalWithReserve(
  env: Env,
  p: { userId: number; amountMinor: number; currency: string; method: string; destinationMasked: string },
): Promise<number> {
  const ts = now()
  const inserted = await env.DB.prepare(
    `INSERT INTO withdrawals (user_id, amount_minor, currency, method, destination_masked, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'PENDING', ?6) RETURNING id`,
  )
    .bind(p.userId, p.amountMinor, p.currency, p.method, p.destinationMasked, ts)
    .first<{ id: number }>()
  if (!inserted) throw new HttpError(500, 'No se pudo crear el retiro')
  const id = Number(inserted.id)

  try {
    // Falla con CHECK(available_minor >= 0) si no hay saldo suficiente;
    // el rollback del batch deja la reserva y el ledger consistentes.
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE wallets SET available_minor = available_minor - ?2, reserved_minor = reserved_minor + ?2, updated_at = ?3
          WHERE user_id = ?1 AND currency = ?4`,
      ).bind(p.userId, p.amountMinor, ts, p.currency),
      env.DB.prepare(
        `INSERT INTO wallet_ledger (user_id, type, direction, amount_minor, currency, source_type, source_id, created_at)
         VALUES (?1, 'WITHDRAWAL_RESERVE', 'DEBIT', ?2, ?3, 'withdrawal', ?4, ?5)`,
      ).bind(p.userId, p.amountMinor, p.currency, id, ts),
    ])
    return id
  } catch (e) {
    // Compensación: retiro nunca puede quedar PENDING sin reserva viva.
    await env.DB.prepare(
      `UPDATE withdrawals SET status = 'CANCELLED', deny_reason = ?2, processed_at = ?3
        WHERE id = ?1 AND status = 'PENDING'`,
    )
      .bind(id, String((e as Error)?.message ?? '').includes('CHECK') ? 'insufficient_funds' : 'internal_error', Date.now())
      .run()
    mapSqliteError(e, 'WITHDRAWAL_RESERVE')
  }
}

/** Denegación: devuelve los fondos reservados al disponible. */
export async function releaseWithdrawal(env: Env, p: MoneyOp): Promise<void> {
  const ts = now()
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE wallets SET reserved_minor = reserved_minor - ?2, available_minor = available_minor + ?2, updated_at = ?3
          WHERE user_id = ?1 AND currency = ?4`,
      ).bind(p.userId, p.amountMinor, ts, p.currency ?? 'USD'),
      env.DB.prepare(
        `INSERT INTO wallet_ledger (user_id, type, direction, amount_minor, currency, source_type, source_id, created_at)
         VALUES (?1, 'WITHDRAWAL_RELEASE', 'CREDIT', ?2, ?3, 'withdrawal', ?4, ?5)`,
      ).bind(p.userId, p.amountMinor, p.currency ?? 'USD', p.sourceId, ts),
    ])
  } catch (e) {
    mapSqliteError(e, 'WITHDRAWAL_RELEASE')
  }
}

/** Marcado como enviado realmente: los reservados salen del sistema. */
export async function settleWithdrawal(env: Env, p: MoneyOp): Promise<void> {
  const ts = now()
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE wallets SET reserved_minor = reserved_minor - ?2, updated_at = ?3
          WHERE user_id = ?1 AND currency = ?4`,
      ).bind(p.userId, p.amountMinor, ts, p.currency ?? 'USD'),
      env.DB.prepare(
        `INSERT INTO wallet_ledger (user_id, type, direction, amount_minor, currency, source_type, source_id, created_at)
         VALUES (?1, 'WITHDRAWAL_SETTLED', 'DEBIT', ?2, ?3, 'withdrawal', ?4, ?5)`,
      ).bind(p.userId, p.amountMinor, p.currency ?? 'USD', p.sourceId, ts),
    ])
  } catch (e) {
    mapSqliteError(e, 'WITHDRAWAL_SETTLED')
  }
}

/** Aprobación de depósito manual: acredita UNA sola vez (UNIQUE protege). */
export async function creditDeposit(env: Env, p: MoneyOp): Promise<void> {
  const ts = now()
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO wallet_ledger (user_id, type, direction, amount_minor, currency, source_type, source_id, created_at)
         VALUES (?1, 'DEPOSIT_CREDIT', 'CREDIT', ?2, ?3, 'deposit', ?4, ?5)`,
      ).bind(p.userId, p.amountMinor, p.currency ?? 'USD', p.sourceId, ts),
      env.DB.prepare(
        `UPDATE wallets SET available_minor = available_minor + ?2, updated_at = ?3
          WHERE user_id = ?1 AND currency = ?4`,
      ).bind(p.userId, p.amountMinor, ts, p.currency ?? 'USD'),
    ])
  } catch (e) {
    mapSqliteError(e, 'DEPOSIT_CREDIT')
  }
}

/** Acredita comision de referido al wallet del referente (5% del deposito). */
export async function creditReferralCommission(
  env: Env,
  p: { userId: number; amountMinor: number; commissionId: number },
): Promise<void> {
  const ts = now()
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO wallet_ledger (user_id, type, direction, amount_minor, currency, source_type, source_id, created_at)
         VALUES (?1, 'REFERRAL_COMMISSION', 'CREDIT', ?2, 'USD', 'referral_commission', ?3, ?4)`,
      ).bind(p.userId, p.amountMinor, p.commissionId, ts),
      env.DB.prepare(
        `UPDATE wallets SET available_minor = available_minor + ?2, updated_at = ?3
         WHERE user_id = ?1 AND currency = 'USD'`,
      ).bind(p.userId, p.amountMinor, ts),
    ])
  } catch (e) {
    mapSqliteError(e, 'REFERRAL_COMMISSION')
  }
}

/**
 * Débito de compra del usuario (animales/combos pagados con saldo USDT).
 * Atómico: el CHECK(available_minor >= 0) impide saldo negativo y el
 * rollback del batch deja ledger y wallet consistentes.
 */
export async function debitPurchase(
  env: Env,
  p: { userId: number; amountMinor: number; currency?: string; sourceId: number },
): Promise<void> {
  const ts = now()
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO wallet_ledger (user_id, type, direction, amount_minor, currency, source_type, source_id, created_at)
         VALUES (?1, 'PURCHASE', 'DEBIT', ?2, ?3, 'purchase', ?4, ?5)`,
      ).bind(p.userId, p.amountMinor, p.currency ?? 'USD', p.sourceId, ts),
      env.DB.prepare(
        `UPDATE wallets SET available_minor = available_minor - ?2, updated_at = ?3
          WHERE user_id = ?1 AND currency = ?4`,
      ).bind(p.userId, p.amountMinor, ts, p.currency ?? 'USD'),
    ])
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    if (msg.includes('CHECK')) throw new HttpError(400, 'Saldo disponible insuficiente')
    if (msg.includes('UNIQUE')) throw new FinancialConflict('PURCHASE: ya procesado (idempotencia)')
    throw e instanceof Error ? e : new Error(msg)
  }
}

/** Crédito por ventas del juego (cosecha, productos, producción de animales).
 * Atómico: crea entrada en ledger y actualiza wallet en un solo batch.
 */
export async function creditSale(
  env: Env,
  p: { userId: number; amountMinor: number; currency?: string; sourceId: number },
): Promise<void> {
  const ts = now()
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO wallet_ledger (user_id, type, direction, amount_minor, currency, source_type, source_id, created_at)
         VALUES (?1, 'GAME_SALE', 'CREDIT', ?2, ?3, 'game_sale', ?4, ?5)`,
      ).bind(p.userId, p.amountMinor, p.currency ?? 'USD', p.sourceId, ts),
      env.DB.prepare(
        `UPDATE wallets SET available_minor = available_minor + ?2, updated_at = ?3
         WHERE user_id = ?1 AND currency = ?4`,
      ).bind(p.userId, p.amountMinor, ts, p.currency ?? 'USD'),
    ])
  } catch (e) {
    mapSqliteError(e, 'GAME_SALE')
  }
}

/** Enmascara el destino dejando cabeza y cola visibles. */
export function maskDestination(raw: string): string {
  const t = raw.trim()
  if (t.length <= 8) return '*'.repeat(t.length)
  return `${t.slice(0, 6)}${'*'.repeat(Math.max(4, Math.min(18, t.length - 10)))}${t.slice(-4)}`
}
