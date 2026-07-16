/* Admin API service for managing users */
import { apiFetch } from './api';
import type { AuthUser } from './auth';

export interface CreateUserPayload {
  email: string;
  nome: string;
  cognome: string;
  ruolo: 'admin' | 'utente';
}

/**
 * Fetch all registered users in the system (Admin only).
 */
export const fetchAllUsers = () =>
  apiFetch<AuthUser[]>('/api/admin/users');

/**
 * Create a new user in Cognito and local DB (Admin only).
 */
export const createNewUser = (payload: { email: string; nome: string; cognome: string; ruolo: string }) =>
  apiFetch<AuthUser>('/api/admin/users', {
    method: 'POST',
    body: payload,
  });
