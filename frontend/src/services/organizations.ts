/* Organization (tenant) management API — super admin only. */
import { apiFetch } from './api';

export type OrgStatus = 'active' | 'suspended';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  created_at: string;
  updated_at: string;
  user_count: number;
  avatar_count: number;
}

/** List every organization with its user and avatar counts (Super Admin). */
export const fetchOrganizations = () =>
  apiFetch<Organization[]>('/api/admin/organizations');

/** Create a new organization (Super Admin only). */
export const createOrganization = (payload: { name: string; slug?: string }) =>
  apiFetch<Organization>('/api/admin/organizations', {
    method: 'POST',
    body: payload,
  });

/** Rename an organization and/or change its slug (Super Admin only). */
export const updateOrganization = (
  organizationId: string,
  payload: { name?: string; slug?: string },
) =>
  apiFetch<Organization>(`/api/admin/organizations/${organizationId}`, {
    method: 'PUT',
    body: payload,
  });

/** Suspend or reactivate an organization (Super Admin only). */
export const setOrganizationStatus = (organizationId: string, status: OrgStatus) =>
  apiFetch<Organization>(`/api/admin/organizations/${organizationId}/status`, {
    method: 'PUT',
    body: { status },
  });

/** Hard-delete an organization with all of its data (Super Admin only). */
export const deleteOrganization = (organizationId: string) =>
  apiFetch<{ message: string; success: boolean }>(
    `/api/admin/organizations/${organizationId}`,
    { method: 'DELETE' },
  );
