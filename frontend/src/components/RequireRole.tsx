import type { ReactElement } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { isAdmin, isStandardUser, isSuperAdmin, type AuthUser } from '../services/auth'

/**
 * Role a route requires. Every route in App.tsx declares one explicitly, so
 * a new page can't slip in without an access decision.
 *
 * Non è una scala: `user` non è il gradino più basso di `admin`, è l'altro
 * lato. Le pagine di chi si allena sono chiuse a chi amministra tanto
 * quanto quelle di amministrazione lo sono a chi si allena.
 */
export type RouteAccess = 'authenticated' | 'user' | 'admin' | 'super_admin'

const ACCESS_CHECKS: Record<RouteAccess, (user: AuthUser | null) => boolean> = {
  /** Any logged in user, whatever the role. */
  authenticated: (user) => user !== null,
  /** Solo il ruolo `user`: quello che si riceve invece di comporlo. */
  user: isStandardUser,
  /** Super admin or organization admin: read only admin views. */
  admin: isAdmin,
  /** Super admin only: everything that writes tenant wide data. */
  super_admin: isSuperAdmin,
}

interface RequireRoleProps {
  access: RouteAccess
  children: ReactElement
}

/**
 * Route level role gate. On a role mismatch (typed URL, stale bookmark,
 * role downgraded while the tab was open) it bounces to `/app`, the home of
 * the signed in area, with `replace`, so the blocked URL leaves no history
 * entry to go back to and its existence is never confirmed.
 *
 * This is UX only: the real enforcement lives in the backend dependencies
 * (`get_current_admin` / `get_current_super_admin`), which answer 403.
 */
export default function RequireRole({ access, children }: RequireRoleProps) {
  const { user } = useAuth()

  if (!ACCESS_CHECKS[access](user)) {
    return <Navigate to="/app" replace />
  }

  return children
}
