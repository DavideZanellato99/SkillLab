/* Auth service for communicating with the backend auth endpoints */

// Same-origin: the Vite dev server proxies /api to the backend (vite.config.ts).
const API_BASE_URL = '';

// =====================================================
//  TYPES
// =====================================================

export type UserStatus = 'active' | 'suspended' | 'disabled';

export interface AuthUser {
  id: string;
  cognito_sub: string;
  email: string;
  nome: string;
  cognome: string;
  role_id: string;
  ruolo: string; // role name: 'super_admin' | 'organization_admin' | 'user'
  status: UserStatus;
  /** Tenant the user belongs to; both null for the super admin. */
  organization_id: string | null;
  organization_name: string | null;
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

/** True for super admin or organization admin — roles that can view the activity report. */
export function isAdmin(user: AuthUser | null): boolean {
  return user?.ruolo === 'super_admin' || user?.ruolo === 'organization_admin';
}

/** Two-letter initials for an avatar badge (first name + last name); falls back to the email's first letter. */
export function getInitials(nome: string, cognome: string, email: string): string {
  const initials = `${nome?.trim()?.[0] ?? ''}${cognome?.trim()?.[0] ?? ''}`.toUpperCase();
  return initials || email[0]?.toUpperCase() || '?';
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
  /** The tokens are NOT here: they live in HttpOnly cookies (XSS mitigation). */
  user: AuthUser;
}

export interface NewPasswordRequiredResponse {
  challenge: 'NEW_PASSWORD_REQUIRED';
  session: string;
  message: string;
}

export type AuthResult = LoginResponse | NewPasswordRequiredResponse;

// =====================================================
//  AUTH API CALLS
//
//  Tokens travel exclusively in HttpOnly + Secure + SameSite=Lax cookies
//  set by the backend: JS never sees them. Every request just needs
//  `credentials: 'include'` so the browser attaches them.
// =====================================================

function isNewPasswordRequired(result: AuthResult): result is NewPasswordRequiredResponse {
  return 'challenge' in result && result.challenge === 'NEW_PASSWORD_REQUIRED';
}

export { isNewPasswordRequired };

async function authFetch<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.detail ?? errorBody?.message ?? response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

/**
 * Login with email and password. On success the backend sets the auth
 * cookies; the body only carries the user profile.
 * Returns NewPasswordRequiredResponse if a password change is needed.
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
 * Rotate the access token cookie using the refresh token cookie.
 * Returns false when the session can't be renewed.
 */
export async function refreshSession(): Promise<boolean> {
  try {
    await authFetch('/api/auth/refresh');
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch the current user profile from the cookie session; retries once
 * after a token refresh. Throws when there is no valid session.
 */
export async function fetchCurrentUser(): Promise<AuthUser> {
  const getMe = () =>
    fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });

  let response = await getMe();
  if (response.status === 401 && (await refreshSession())) {
    response = await getMe();
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sessione scaduta. Effettua nuovamente il login.');
    }
    throw new Error('Errore nel recupero del profilo utente.');
  }

  return response.json() as Promise<AuthUser>;
}

/**
 * Logout — the backend clears the HttpOnly cookies (JS can't touch them).
 */
export async function logout(): Promise<void> {
  try {
    await authFetch('/api/auth/logout');
  } catch {
    // Even if the request fails the UI resets; cookies expire on their own
  }
}
