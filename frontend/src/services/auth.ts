/* Auth service for communicating with the backend auth endpoints */

// Same-origin: the Vite dev server proxies /api to the backend (vite.config.ts).
const API_BASE_URL = ''

// =====================================================
//  TYPES
// =====================================================

export type UserStatus = 'active' | 'suspended' | 'disabled'

/* L'account come lo legge chi lo usa: è quello che tornano l'accesso e
 * /api/auth/me. Senza la paternità, che è roba dell'amministrazione e sta su
 * AdminUser (services/admin.ts). */
export interface AuthUser {
  id: string
  cognito_sub: string
  email: string
  nome: string
  cognome: string
  role_id: string
  ruolo: string // role name: 'super_admin' | 'organization_admin' | 'user'
  status: UserStatus
  /** Tenant the user belongs to; both null for the super admin. */
  organization_id: string | null
  organization_name: string | null
  /** Ultimo accesso riuscito; null se l'account non è mai stato usato. */
  last_login_at: string | null
  /** Ultima richiesta fatta dall'account, scritta a intervalli di pochi
   * minuti: con una sessione che si rinnova da sola è una data ben diversa
   * dall'ultimo accesso. Null alla stessa condizione, un account mai usato. */
  last_activity_at: string | null
  created_at: string
  updated_at: string
}

// =====================================================
//  ROLES
// =====================================================

export type RoleName = 'super_admin' | 'organization_admin' | 'user'

/* Le etichette dei badge, che stanno in una pastiglia stretta accanto al nome:
 * il ruolo esteso ("Amministratore Organizzazione") lo scrivono le tendine in
 * cui il ruolo si sceglie, dove lo spazio c'è e la distinzione conta. */
export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  organization_admin: 'Amministratore',
  user: 'Utente',
}

/** Tailwind classes for the role badge pill, per role name. */
export const ROLE_BADGE_CLASSES: Record<string, string> = {
  super_admin: 'border border-pink-500/30 bg-pink-500/15 text-pink-500',
  organization_admin: 'border border-violet-600/30 bg-violet-600/15 text-violet-400',
  user: 'border border-cyan-500/25 bg-cyan-500/10 text-cyan-400',
}

/** True if the user is a super admin — the only role allowed to manage users. */
export function isSuperAdmin(user: AuthUser | null): boolean {
  return user?.ruolo === 'super_admin'
}

/** True for super admin or organization admin — roles that can view the activity report. */
export function isAdmin(user: AuthUser | null): boolean {
  return user?.ruolo === 'super_admin' || user?.ruolo === 'organization_admin'
}

/* Solo chi si allena: i percorsi affidati sono suoi, e chi amministra li
 * compone dalla propria sezione senza riceverne. */
export function isStandardUser(user: AuthUser | null): boolean {
  return user?.ruolo === 'user'
}

/* L'account di sistema: la via di servizio che resta quando Cognito non
 * risponde. Non ha una password su Cognito, quindi non la si cambia, e il suo
 * ruolo e il suo stato non si toccano dall'anagrafica.
 *
 * Il `sub` è quello che riconosce il server (MOCK_ADMIN_SUB in
 * backend/auth_dependency.py) e il confronto è esatto come là: è quell'unico
 * account, non una famiglia di account, e un prefisso avrebbe spento i moduli
 * a chiunque si fosse ritrovato un `sub` che comincia allo stesso modo. */
export const SYSTEM_ACCOUNT_SUB = 'mock-admin-sub-0000-0000-0000'

export function isSystemAccount(user: { cognito_sub: string }): boolean {
  return user.cognito_sub === SYSTEM_ACCOUNT_SUB
}

/** Two-letter initials for an avatar badge (first name + last name); falls back to the email's first letter. */
export function getInitials(nome: string, cognome: string, email: string): string {
  const initials = `${nome?.trim()?.[0] ?? ''}${cognome?.trim()?.[0] ?? ''}`.toUpperCase()
  return initials || email[0]?.toUpperCase() || '?'
}

// =====================================================
//  PASSWORD POLICY
// =====================================================

// Must mirror the Cognito user pool policy and the backend validation
// (backend/routers/auth.py). Cognito counts only these characters as symbols.
export const PASSWORD_MIN_LENGTH = 12

const COGNITO_SYMBOLS = new Set('^$*.[]{}()?-"!@#%&/\\,><\':;|_~`+=')

export interface PasswordRule {
  label: string
  test: (password: string) => boolean
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
]

/** Labels of the password policy rules that `password` does not meet. */
export function getUnmetPasswordRules(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label)
}

export interface LoginResponse {
  /** The tokens are NOT here: they live in HttpOnly cookies (XSS mitigation). */
  user: AuthUser
}

export interface NewPasswordRequiredResponse {
  challenge: 'NEW_PASSWORD_REQUIRED'
  session: string
  message: string
}

export type AuthResult = LoginResponse | NewPasswordRequiredResponse

// =====================================================
//  AUTH API CALLS
//
//  Tokens travel exclusively in HttpOnly + Secure + SameSite=Lax cookies
//  set by the backend: JS never sees them. Every request just needs
//  `credentials: 'include'` so the browser attaches them.
// =====================================================

function isNewPasswordRequired(result: AuthResult): result is NewPasswordRequiredResponse {
  return 'challenge' in result && result.challenge === 'NEW_PASSWORD_REQUIRED'
}

export { isNewPasswordRequired }

async function authFetch<T>(endpoint: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const message = errorBody?.detail ?? errorBody?.message ?? response.statusText
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

/**
 * Login with email and password. On success the backend sets the auth
 * cookies; the body only carries the user profile.
 * Returns NewPasswordRequiredResponse if a password change is needed.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  return authFetch<AuthResult>('/api/auth/login', { email, password })
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
  })
}

/**
 * Il rinnovo in corso, se ce n'è uno. Chi arriva mentre è in volo aspetta
 * quello invece di aprirne un altro (vedi `refreshSession`).
 */
let refreshInFlight: Promise<boolean> | null = null

async function rotateAccessToken(): Promise<boolean> {
  try {
    await authFetch('/api/auth/refresh')
    return true
  } catch {
    return false
  }
}

/**
 * Rotate the access token cookie using the refresh token cookie.
 * Returns false when the session can't be renewed.
 *
 * Uno alla volta per tutta l'applicazione. L'access token scade mentre la
 * pagina ha già cinque richieste in volo, quindi i 401 arrivano insieme:
 * senza questo, ognuno di loro aprirebbe il proprio rinnovo, cioè cinque
 * chiamate a Cognito nello stesso istante per ottenere la stessa cosa.
 * Cognito le limita, e basta che una venga rifiutata perché chi la stava
 * aspettando si ritrovi buttato fuori da una sessione ancora valida.
 *
 * La promessa si azzera appena finisce, quindi il rinnovo successivo (un'ora
 * dopo, alla scadenza seguente) riparte davvero invece di riusare l'esito
 * vecchio.
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = rotateAccessToken().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/**
 * Fetch the current user profile from the cookie session; retries once
 * after a token refresh. Throws when there is no valid session.
 */
export async function fetchCurrentUser(): Promise<AuthUser> {
  const getMe = () => fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' })

  let response = await getMe()
  if (response.status === 401 && (await refreshSession())) {
    response = await getMe()
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sessione scaduta. Effettua nuovamente il login.')
    }
    throw new Error('Errore nel recupero del profilo utente.')
  }

  return response.json() as Promise<AuthUser>
}

/**
 * Logout — the backend clears the HttpOnly cookies (JS can't touch them).
 */
export async function logout(): Promise<void> {
  try {
    await authFetch('/api/auth/logout')
  } catch {
    // Even if the request fails the UI resets; cookies expire on their own
  }
}
