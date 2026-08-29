/**
 * Cliente HTTP hacia el backend (Cloudflare Worker).
 *
 * - Autenticación: la Mini App envía SIEMPRE la cabecera X-Telegram-Init-Data
 *   con el initData firmado que inyecta el cliente Telegram; el servidor lo
 *   verifica con HMAC y resuelve el rol. Nada de roles viaja desde el cliente.
 * - Desarrollo (?dev-telegram): no hay initData real, así que se usa el
 *   usuario sintético X-Dev-User (sólo aceptado por el worker local con
 *   DEV_MODE=1). El ID se toma de ?dev-user=<id> y por defecto es el del
 *   super administrador para poder ver el panel.
 * - Tolerancia a fallos: si el backend no está disponible, el juego sigue
 *   funcionando igual (el llamador decide qué mostrar).
 */

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

const DEV_SUPER_ADMIN_ID = '5563151323'

interface TelegramWindow {
  Telegram?: { WebApp?: { initData?: string } }
}

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const initData = (window as unknown as TelegramWindow).Telegram?.WebApp?.initData ?? ''
  if (initData) return { 'X-Telegram-Init-Data': initData }
  if (import.meta.env.DEV) {
    const dev = new URLSearchParams(window.location.search).get('dev-user') ?? DEV_SUPER_ADMIN_ID
    return { 'X-Dev-User': dev }
  }
  return {}
}

/** Error de API con código HTTP, mensaje del servidor y saldo opcional. */
export class ApiError extends Error {
  readonly status: number
  /** Saldo real del servidor cuando el débito falla por saldo insuficiente. */
  readonly serverBalance?: number
  constructor(status: number, message: string, serverBalance?: number) {
    super(message)
    this.status = status
    this.serverBalance = serverBalance
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* respuesta sin cuerpo */
  }
  if (!res.ok) {
    const raw = (body ?? {}) as Record<string, unknown>
    const message =
      typeof raw.message === 'string'
        ? raw.message
        : typeof raw.error === 'string'
          ? raw.error
          : `HTTP ${res.status}`
    const serverBalance = typeof raw.availableMinor === 'number' ? raw.availableMinor : undefined
    throw new ApiError(res.status, message, serverBalance)
  }
  return body as T
}

export const apiGet = <T>(path: string) => request<T>(path)
export const apiPost = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })

/* ── Tipos espejo del backend ────────────────────────────────────────────── */

export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN'

export interface MeResponse {
  user: {
    id: number
    telegramId: string
    username: string | null
    firstName: string | null
    role: Role
    status: string
  }
  wallets: WalletRow[]
  unreadNotifications: number
}

/** Config del apartado de depósitos (espejo de /api/wallet/deposit-config). */
export interface DepositConfig {
  walletAddress: string
  network: string
  telegram: string
}

/** Depósito propio (espejo de GET /api/wallet/deposits). */
export interface MyDepositRow {
  id: number
  amountMinor: number
  currency: string
  method: string
  reference: string | null
  status: string
  createdAt: number
}

/** Retiro propio (espejo de GET /api/wallet/withdrawals). */
export interface MyWithdrawalRow {
  id: number
  amountMinor: number
  currency: string
  method: string
  destinationMasked: string
  status: string
  denyReason: string | null
  createdAt: number
}

/** Estadísticas de referidos. */
export interface ReferralStats {
  directReferrals: number
  totalNetwork: number
  totalEarned: number
  available: number
  pending: number
}

/** Fila del árbol de referidos. */
export interface ReferralTreeRow {
  referred_id: number
  created_at: number
  username: string | null
  first_name: string | null
  children: number
}

/** Fila de comisión de referido. */
export interface ReferralCommissionRow {
  id: number
  deposit_minor: number
  pct_bps: number
  amount_minor: number
  status: string
  created_at: number
  referred_username: string | null
  referred_name: string | null
}

export interface WalletRow {
  currency: string
  availableMinor: number
  reservedMinor: number
}

/** Inventario de un cultivo en el servidor. */
export interface CropServerInventory {
  seeds: number
  harvest: number
}

/** Parcela sembrada en el servidor. */
export interface CropPlotServerRow {
  plotIndex: number
  cropId: string
  quantity: number
  plantedAt: number
  readyAt: number
}

export interface LedgerRow {
  id: number
  type: string
  direction: string
  amountMinor: number
  sourceType: string
  sourceId: number
  createdAt: number
}

export interface DepositRow {
  id: number
  userId: number
  username: string | null
  telegramId: number
  amountMinor: number
  currency: string
  status: string
  reference: string | null
  createdAt: number
}

export interface WithdrawalRow {
  id: number
  userId: number
  username: string | null
  firstName: string | null
  telegramId: number
  amountMinor: number
  currency: string
  method: string
  destinationMasked: string
  status: string
  denyReason: string | null
  createdAt: number
}

export interface NotificationRow {
  id: number
  title: string
  message: string
  type: string
  priority: string
  startsAt: number | null
  expiresAt: number | null
  readAt: number | null
  sentAt: number
}

export interface DashboardTotals {
  pendingWithdrawals: number
  pendingDeposits: number
  totalUsers: number
  totalAvailableMinor: number
  totalReservedMinor: number
}

export interface DashboardResponse {
  totals: DashboardTotals
  recentOps: Array<{
    kind: 'withdrawal' | 'deposit'
    id: number
    userId: number
    username: string | null
    telegramId: number
    amountMinor: number
    currency: string
    status: string
    createdAt: number
  }>
}

export interface AuditRow {
  id: number
  action: string
  actorTelegramId: number | null
  actorUsername: string | null
  targetType: string
  targetId: number
  reason: string | null
  metadataJson: string | null
  createdAt: number
}

export interface UserAdminRow {
  id: number
  telegramId: number
  username: string | null
  firstName: string | null
  role: Role
  status: string
  createdAt: number
  lastSeenAt: number | null
  availableMinor: number | null
  reservedMinor: number | null
}

/* ── Endpoints ───────────────────────────────────────────────────────────── */

export const api = {
  me: () => apiGet<MeResponse>('/me'),
  wallet: () =>
    apiGet<{ wallets: WalletRow[]; ledger: LedgerRow[] }>('/wallet'),
  notifications: () => apiGet<{ items: NotificationRow[]; unread: number }>('/notifications'),
  markNotificationRead: (id: number) => apiPost<{ ok: boolean; changed: boolean }>(`/notifications/${id}/read`),
  depositConfig: () => apiGet<DepositConfig>('/wallet/deposit-config'),
  createDeposit: (amountMinor: number, reference?: string) =>
    apiPost<{ id: number; status: string }>('/wallet/deposits', {
      amountMinor,
      ...(reference ? { reference } : {}),
    }),
  myDeposits: (page = 1) =>
    apiGet<{ items: MyDepositRow[]; hasMore: boolean }>(`/wallet/deposits?page=${page}`),
  debitWallet: (amountMinor: number, concept: string, meta?: { qty?: number; level?: number; processorLevel?: number }) =>
    apiPost<{ ok: boolean; availableMinor: number }>('/wallet/debit', {
      amountMinor,
      concept,
      ...(meta ?? {}),
    }),

  // Retiros
  createWithdrawal: (amountMinor: number, method: string, destination: string) =>
    apiPost<{ id: number; status: string; reserved: number }>('/wallet/withdrawals', { amountMinor, method, destination }),
  myWithdrawals: (page = 1) =>
    apiGet<{ items: MyWithdrawalRow[]; hasMore: boolean }>(`/wallet/withdrawals?page=${page}`),

  // Productos (inventario autoritativo server-side)
  goods: () => apiGet<{ goods: Record<string, number> }>('/goods'),
  goodsInit: (goods: Record<string, number>, animals: Record<string, number>) =>
    apiPost<{ ok: boolean; initialized: boolean; goods: Record<string, number> }>('/goods/init', { goods, animals }),
  goodsRegisterAnimals: (items: { kind: string; qty: number }[]) =>
    apiPost<{ ok: boolean }>('/goods/animals', { items }),
  goodsProduce: (goodId: string, qty: number, via: 'animal' | 'processing', kind?: string, inputGoodId?: string) =>
    apiPost<{ ok: boolean; credited: number; goods: Record<string, number> }>('/goods/produce', {
      goodId,
      qty,
      via,
      ...(kind ? { kind } : {}),
      ...(inputGoodId ? { inputGoodId } : {}),
    }),
  goodsConsume: (goodId: string, qty: number) =>
    apiPost<{ ok: boolean; reason?: string; goods: Record<string, number> }>('/goods/consume', { goodId, qty }),
  goodsCancelConsume: (goodId: string, qty: number) =>
    apiPost<{ ok: boolean; reason?: string; goods: Record<string, number> }>('/goods/consume-cancel', { goodId, qty }),
  goodsSell: (goodId: string, qty: number) =>
    apiPost<{ ok: boolean; availableMinor: number; creditedMinor: number; goods: Record<string, number> }>(
      '/goods/sell',
      { goodId, qty },
    ),

  // Cosechas (inventario + parcelas autoritativas server-side)
  crops: () =>
    apiGet<{ crops: Record<string, CropServerInventory>; plots: CropPlotServerRow[] }>('/crops'),
  cropsInit: (crops: Record<string, { seeds: number; harvest: number }>, plots: Array<{ plotIndex: number; cropId: string; quantity: number; plantedAt?: number }>) =>
    apiPost<{ ok: boolean; initialized: boolean; crops: Record<string, CropServerInventory>; plots: CropPlotServerRow[] }>('/crops/init', { crops, plots }),
  cropsPurchase: (cropId: string, qty: number) =>
    apiPost<{ ok: boolean; availableMinor: number; crops: Record<string, CropServerInventory> }>('/crops/purchase', { cropId, qty }),
  cropsGrantSeeds: (cropId: string, qty: number) =>
    apiPost<{ ok: boolean; crops: Record<string, CropServerInventory> }>('/crops/seeds', { cropId, qty }),
  cropsPlant: (cropId: string, plotIndex: number, quantity: number, plantedAt?: number) =>
    apiPost<{ ok: boolean; crops: Record<string, CropServerInventory>; plots: CropPlotServerRow[] }>('/crops/plant', {
      cropId,
      plotIndex,
      quantity,
      ...(plantedAt !== undefined ? { plantedAt } : {}),
    }),
  cropsHarvest: (plotIndex: number) =>
    apiPost<{ ok: boolean; harvested?: number; crops: Record<string, CropServerInventory> }>('/crops/harvest', { plotIndex }),
  cropsSell: (cropId: string, qty: number) =>
    apiPost<{ ok: boolean; availableMinor: number; creditedMinor: number; crops: Record<string, CropServerInventory> }>(
      '/crops/sell',
      { cropId, qty },
    ),

  // Referidos
  referralCode: () => apiGet<{ code: string }>('/referrals/code'),
  registerReferral: (code: string) => apiPost<{ ok: boolean; referrerCode: string }>('/referrals/register', { code }),
  referralStats: () => apiGet<ReferralStats>('/referrals/stats'),
  referralTree: () => apiGet<{ items: ReferralTreeRow[] }>('/referrals/tree'),
  referralCommissions: (page = 1) =>
    apiGet<{ items: ReferralCommissionRow[]; hasMore: boolean }>(`/referrals/commissions?page=${page}`),

  admin: {
    dashboard: () => apiGet<DashboardResponse>('/admin/dashboard'),
    withdrawals: (status = 'PENDING', page = 1) =>
      apiGet<{ items: WithdrawalRow[]; hasMore: boolean }>(`/admin/withdrawals?status=${encodeURIComponent(status)}&page=${page}`),
    deposits: (status = 'PENDING', page = 1) =>
      apiGet<{ items: DepositRow[]; hasMore: boolean }>(`/admin/deposits?status=${encodeURIComponent(status)}&page=${page}`),
    approveWithdrawal: (id: number) => apiPost<{ id: number; status: string }>(`/admin/withdrawals/${id}/approve`),
    denyWithdrawal: (id: number, reason: string) => apiPost<{ id: number; status: string }>(`/admin/withdrawals/${id}/deny`, { reason }),
    completeWithdrawal: (id: number) => apiPost<{ id: number; status: string }>(`/admin/withdrawals/${id}/complete`),
    approveDeposit: (id: number) => apiPost<{ id: number; status: string }>(`/admin/deposits/${id}/approve`),
    cancelDeposit: (id: number, reason: string) => apiPost<{ id: number; status: string }>(`/admin/deposits/${id}/cancel`, { reason }),
    createNotification: (payload: { title: string; message: string; type: string; priority: string; startsAt?: number; expiresAt?: number }) =>
      apiPost<{ id: number }>('/admin/notifications', payload),
    users: (q = '', page = 1) =>
      apiGet<{ items: UserAdminRow[]; hasMore: boolean }>(`/admin/users?q=${encodeURIComponent(q)}&page=${page}`),
    setUserRole: (id: number, role: Role) => apiPost<{ id: number; role: Role }>(`/admin/users/${id}/role`, { role }),
    audit: (action = '', page = 1) =>
      apiGet<{ items: AuditRow[]; hasMore: boolean }>(`/admin/audit?action=${encodeURIComponent(action)}&page=${page}`),
  },
}

/** Formatea unidades menores como cantidad legible ($1.234,56). */
export function fmtMoney(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : ''
  const abs = Math.abs(amountMinor)
  const whole = Math.floor(abs / 100).toLocaleString('es')
  const cents = String(abs % 100).padStart(2, '0')
  return `${sign}$${whole},${cents}`
}
