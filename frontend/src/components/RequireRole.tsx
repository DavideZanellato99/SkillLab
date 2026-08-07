import type { ReactElement } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { isAdmin, isSuperAdmin, type AuthUser } from '../services/auth'

/**
 * Minimum role a route requires. Every route in App.tsx declares one
 * explicitly, so a new page can't slip in without an access decision.
 */
export type RouteAccess = 'authenticated' | 'admin' | 'super_admin'

const ACCESS_CHECKS: Record<RouteAccess, (user: AuthUser | null) => boolean> = {
  /** Any logged in user, whatever the role. */
  authenticated: (user) => user !== null,
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
 * role downgraded while the tab was open) it bounces to the home page with
 * `replace`, so the blocked URL leaves no history entry to go back to and
 * its existence is never confirmed.
 *
 * This is UX only: the real enforcement lives in the backend dependencies
 * (`get_current_admin` / `get_current_super_admin`), which answer 403.
 */
export default function RequireRole({ access, children }: RequireRoleProps) {
  const { user } = useAuth()

  if (!ACCESS_CHECKS[access](user)) {
    return <Navigate to="/" replace />
  }

  return children
}
