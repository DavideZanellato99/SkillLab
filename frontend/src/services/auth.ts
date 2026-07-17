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

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  organization_admin: 'Org Admin',
  user: 'User',
};

/** Tailwind classes for the role badge pill, per role name. */
export const ROLE_BADGE_CLASSES: Record<string, string> = {
  super_admin: 'border border-pink-500/30 bg-pink-500/15 text-pink-500',
  organization_admin: 'border border-violet-600/30 bg-violet-600/15 text-violet-400',
  user: 'border border-cyan-500/25 bg-cyan-500/10 text-cyan-400',
};

/** True if the user is a super admin — the only role allowed to manage users. */
export function isSuperAdmin(user: AuthUser | null): boolean {
  return user?.ruolo === 'super_admin';
}

// =====================================================
//  PASSWORD POLICY
// =====================================================

// Must mirror the Cognito user pool policy and the backend validation
// (backend/routers/auth.py). Cognito counts only these characters as symbols.
export const PASSWORD_MIN_LENGTH = 12;

const COGNITO_SYMBOLS = new Set("^$*.[]{}()?-\"!@#%&/\\,><':;|_~`+=");

export interface PasswordRule {
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: `Almeno ${PASSWORD_MIN_LENGTH} caratteri`,
    test: (pw) => pw.length >= PASSWORD_MIN_LENGTH,
  },
  { label: 'Una lettera maiuscola', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'Una lettera minuscola', test: (pw) => /[a-z]/.test(pw) },
  { label: 'Un numero', test: (pw) => /[0-9]/.test(pw) },
  {
    label: 'Un simbolo (es. !@#$%)',
    test: (pw) => [...pw].some((ch) => COGNITO_SYMBOLS.has(ch)),
  },
];

/** Labels of the password policy rules that `password` does not meet. */
export function getUnmetPasswordRules(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label);
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
