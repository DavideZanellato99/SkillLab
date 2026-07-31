/* Organization (tenant) management API — super admin only. */
import { apiFetch } from './api'
import type { Authored } from './authorship'

export type OrgStatus = 'active' | 'suspended'

export interface Organization extends Authored {
  id: string
  name: string
  slug: string
  status: OrgStatus
  /** Valorizzato solo mentre l'organizzazione è sospesa: il motivo scritto dall'admin. */
  suspension_reason: string | null
  user_count: number
  avatar_count: number
}

/** Un'organizzazione con quanto i suoi utenti si allenano davvero. */
export interface OrganizationDetail extends Organization {
  conversations_last_30_days: number
  conversations_total: number
  /** Media dei voti delle conversazioni valutate; null se non ce n'è ancora nessuna. */
  average_score: number | null
  evaluated_count: number
  /** Ultimo accesso riuscito fra gli utenti del tenant; null se nessuno ha mai acceduto. */
  last_login_at: string | null
}

/** List every organization with its user and avatar counts (Super Admin). */
export const fetchOrganizations = () => apiFetch<Organization[]>('/api/admin/organizations')

/** Una singola organizzazione con le statistiche di utilizzo (Super Admin). */
export const fetchOrganization = (organizationId: string) =>
  apiFetch<OrganizationDetail>(`/api/admin/organizations/${organizationId}`)

/** Create a new organization (Super Admin only). */
export const createOrganization = (payload: { name: string; slug?: string }) =>
  apiFetch<Organization>('/api/admin/organizations', {
    method: 'POST',
    body: payload,
  })

/** Rename an organization and/or change its slug (Super Admin only). */
export const updateOrganization = (
  organizationId: string,
  payload: { name?: string; slug?: string },
) =>
  apiFetch<Organization>(`/api/admin/organizations/${organizationId}`, {
    method: 'PUT',
    body: payload,
  })

/**
 * Suspend or reactivate an organization (Super Admin only). Il motivo viaggia
 * con la sospensione ed è quello che leggono gli utenti bloccati; alla
 * riattivazione viene cancellato dal backend.
 */
export const setOrganizationStatus = (organizationId: string, status: OrgStatus, reason?: string) =>
  apiFetch<Organization>(`/api/admin/organizations/${organizationId}/status`, {
    method: 'PUT',
    body: { status, reason: reason?.trim() || null },
  })

/** Hard-delete an organization with all of its data (Super Admin only). */
export const deleteOrganization = (organizationId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/organizations/${organizationId}`, {
    method: 'DELETE',
  })
