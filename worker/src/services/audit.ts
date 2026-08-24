/**
 * Auditoría administrativa: cada acción sensible queda registrada.
 * Los registros NO se exponen a borrado desde la API ordinaria.
 */

import type { Env } from '../env'

export interface AuditEntry {
  adminUserId: number
  action: string
  targetUserId?: number | null
  targetTransactionId?: number | null
  oldStatus?: string | null
  newStatus?: string | null
  amountMinor?: number | null
  currency?: string | null
  reason?: string | null
  metadata?: Record<string, unknown> | null
}

export async function audit(env: Env, e: AuditEntry): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO admin_audit_log
       (admin_user_id, action, target_user_id, target_transaction_id,
        old_status, new_status, amount_minor, currency, reason, metadata, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  )
    .bind(
      e.adminUserId,
      e.action,
      e.targetUserId ?? null,
      e.targetTransactionId ?? null,
      e.oldStatus ?? null,
      e.newStatus ?? null,
      e.amountMinor ?? null,
      e.currency ?? null,
      e.reason ?? null,
      e.metadata ? JSON.stringify(e.metadata) : null,
      Date.now(),
    )
    .run()
}

/**
 * Transición de estado condicional: UN solo ganador bajo concurrencia.
 * Devuelve true si esta llamada hizo el cambio; false si otro admin llegó antes.
 * Usa placeholders posicionales (D1 exige continuidad en los numerados).
 */
export async function transitionStatus(
  env: Env,
  table: 'withdrawals' | 'deposits',
  id: number,
  from: string[],
  to: string,
  extra?: { processedBy?: number; denyReason?: string },
): Promise<boolean> {
  const placeholders = from.map(() => '?').join(',')
  const sql = `UPDATE ${table}
     SET status = ?,
         processed_at = CASE WHEN ? IN ('COMPLETED','DENIED','CANCELLED') THEN ? ELSE processed_at END,
         processed_by = COALESCE(?, processed_by)
         ${extra?.denyReason !== undefined ? ', deny_reason = ?' : ''}
   WHERE id = ? AND status IN (${placeholders})`
  const args: unknown[] = [to, to, Date.now(), extra?.processedBy ?? null]
  if (extra?.denyReason !== undefined) args.push(extra.denyReason)
  args.push(id, ...from)
  const result = await env.DB.prepare(sql).bind(...args).run()
  return (result.meta.changes ?? 0) === 1
}
