/* Audit trail API — super admin only.
 *
 * Read-only by design: the backend exposes no way to edit or delete a
 * recorded action, so there is nothing to write here either. Rows leave the
 * registry only when the server-side retention expires them.
 */
import { apiFetch } from './api'

export interface AuditLog {
  id: string
  created_at: string
  /** Null once the user has been deleted; `user_email` keeps the row readable. */
  user_id: string | null
  user_email: string
  user_role: string
  organization_id: string | null
  organization_name: string | null
  /** Stable key of the action ("user.create"), what the filter matches on. */
  action: string
  /** Italian wording of `action`, resolved server-side. */
  action_label: string
  resource_type: string | null
  resource_id: string | null
  method: string
  path: string
  status_code: number
  client_ip: string
  user_agent: string
  /** Extras whitelisted by the endpoint (target email, avatar name...). */
  details: Record<string, unknown> | null
}

/** A window over the registry: `total` counts every row matching the filters. */
export interface AuditLogPage {
  total: number
  items: AuditLog[]
}

export interface AuditActionOption {
  key: string
  label: string
}

export interface AuditLogFilters {
  userId?: string
  organizationId?: string
  action?: string
  /** ISO date (yyyy-mm-dd), inclusive. */
  dateFrom?: string
  dateTo?: string
  search?: string
  limit?: number
  offset?: number
}

/**
 * Read a window of the registry, newest first. The table grows without
 * bound, so the caller always asks for a slice and uses `total` to know
 * how much is left behind it.
 */
export const fetchAuditLogs = (filters: AuditLogFilters = {}) =>
  apiFetch<AuditLogPage>('/api/admin/audit-logs', {
    params: {
      ...(filters.userId ? { user_id: filters.userId } : {}),
      ...(filters.organizationId ? { organization_id: filters.organizationId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      // The end of the day, so "fino al 3" includes everything of the 3rd
      ...(filters.dateFrom ? { date_from: `${filters.dateFrom}T00:00:00` } : {}),
      ...(filters.dateTo ? { date_to: `${filters.dateTo}T23:59:59` } : {}),
      ...(filters.search ? { q: filters.search } : {}),
      ...(filters.limit !== undefined ? { limit: String(filters.limit) } : {}),
      ...(filters.offset !== undefined ? { offset: String(filters.offset) } : {}),
    },
  })

/** The catalogue of recordable actions, for the filter dropdown. */
export const fetchAuditActions = () =>
  apiFetch<AuditActionOption[]>('/api/admin/audit-logs/actions')
