/* Auth service for communicating with the backend auth endpoints */

const API_BASE_URL = 'http://localhost:8000';

// =====================================================
//  TYPES
// =====================================================

export interface AuthUser {
  id: string;
  cognito_sub: string;
  email: string;
  nome: string;
  cognome: string;
  role_id: string;
  ruolo: string; // role name: 'super_admin' | 'organization_admin' | 'user'
  created_at: string;
  updated_at: string;
}

// =====================================================
//  ROLES
// =====================================================

export type RoleName = 'super_admin' | 'organization_admin' | 'user';

export const ADMIN_ROLES: RoleName[] = ['super_admin', 'organization_admin'];

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  organization_admin: 'Org Admin',
  user: 'User',
};

/** True if the user holds an admin role (super_admin or organization_admin). */
export function isAdminUser(user: AuthUser | null): boolean {
  return !!user && (ADMIN_ROLES as string[]).includes(user.ruolo);
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

export interface NewPasswordRequiredResponse {
  challenge: 'NEW_PASSWORD_REQUIRED';
  session: string;
  message: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  token_type: string;
}

export type AuthResult = LoginResponse | NewPasswordRequiredResponse;

// =====================================================
//  TOKEN STORAGE
// =====================================================

const TOKEN_KEYS = {
  accessToken: 'skilllab_access_token',
  refreshToken: 'skilllab_refresh_token',
  user: 'skilllab_user',
} as const;

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEYS.accessToken);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(TOKEN_KEYS.refreshToken);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(TOKEN_KEYS.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeAuthData(data: LoginResponse): void {
  localStorage.setItem(TOKEN_KEYS.accessToken, data.access_token);
  localStorage.setItem(TOKEN_KEYS.refreshToken, data.refresh_token);
  localStorage.setItem(TOKEN_KEYS.user, JSON.stringify(data.user));
}

export function clearAuthData(): void {
  localStorage.removeItem(TOKEN_KEYS.accessToken);
  localStorage.removeItem(TOKEN_KEYS.refreshToken);
  localStorage.removeItem(TOKEN_KEYS.user);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

// =====================================================
//  AUTH API CALLS
// =====================================================

function isNewPasswordRequired(result: AuthResult): result is NewPasswordRequiredResponse {
  return 'challenge' in result && result.challenge === 'NEW_PASSWORD_REQUIRED';
}

export { isNewPasswordRequired };

async function authFetch<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.detail ?? errorBody?.message ?? response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

/**
 * Login with email and password.
 * Returns LoginResponse on success or NewPasswordRequiredResponse if password change is needed.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  return authFetch<AuthResult>('/api/auth/login', { email, password });
}

/**
 * Complete the new password challenge (first login with temporary password).
 */
export async function completeNewPassword(
  email: string,
  newPassword: string,
  session: string,
): Promise<LoginResponse> {
  return authFetch<LoginResponse>('/api/auth/new-password', {
    email,
    new_password: newPassword,
    session,
  });
}

/**
 * Refresh the access token using the stored refresh token.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const result = await authFetch<RefreshTokenResponse>('/api/auth/refresh', {
      refresh_token: refreshToken,
    });
    localStorage.setItem(TOKEN_KEYS.accessToken, result.access_token);
    return result.access_token;
  } catch {
    // Refresh token expired — clear everything
    clearAuthData();
    return null;
  }
}

/**
 * Fetch the current user profile (verifies token is still valid).
 */
export async function fetchCurrentUser(): Promise<AuthUser> {
  const token = getAccessToken();
  if (!token) throw new Error('Non autenticato.');

  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Try refreshing the token
      const newToken = await refreshAccessToken();
      if (newToken) {
        const retryResponse = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${newToken}` },
        });
        if (retryResponse.ok) {
          return retryResponse.json() as Promise<AuthUser>;
        }
      }
      clearAuthData();
      throw new Error('Sessione scaduta. Effettua nuovamente il login.');
    }
    throw new Error('Errore nel recupero del profilo utente.');
  }

  return response.json() as Promise<AuthUser>;
}

/**
 * Logout — clear all stored auth data.
 */
export function logout(): void {
  clearAuthData();
}
