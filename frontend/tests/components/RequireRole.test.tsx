import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RequireRole, { type RouteAccess } from '../../src/components/RequireRole'
import type { AuthUser, RoleName } from '../../src/services/auth'

let currentUser: AuthUser | null = null

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: currentUser }),
}))

function signedInAs(ruolo: RoleName) {
  currentUser = { ruolo } as AuthUser
}

/** Lands on a guarded route; `/app`, the home of the signed in area, stands
 *  in for the redirect target. */
function renderGuardedRoute(access: RouteAccess) {
  render(
    <MemoryRouter initialEntries={['/app/riservata']}>
      <Routes>
        <Route path="/app" element={<p>Home</p>} />
        <Route
          path="/app/riservata"
          element={
            <RequireRole access={access}>
              <p>Contenuto riservato</p>
            </RequireRole>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireRole', () => {
  beforeEach(() => {
    currentUser = null
  })

  it('lets a super admin into a super_admin route', () => {
    signedInAs('super_admin')
    renderGuardedRoute('super_admin')
    expect(screen.getByText('Contenuto riservato')).toBeInTheDocument()
  })

  it('redirects an organization admin away from a super_admin route', () => {
    signedInAs('organization_admin')
    renderGuardedRoute('super_admin')
    expect(screen.queryByText('Contenuto riservato')).not.toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('lets an organization admin into an admin route', () => {
    signedInAs('organization_admin')
    renderGuardedRoute('admin')
    expect(screen.getByText('Contenuto riservato')).toBeInTheDocument()
  })

  it('redirects a plain user away from an admin route', () => {
    signedInAs('user')
    renderGuardedRoute('admin')
    expect(screen.queryByText('Contenuto riservato')).not.toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('lets a plain user into an authenticated route', () => {
    signedInAs('user')
    renderGuardedRoute('authenticated')
    expect(screen.getByText('Contenuto riservato')).toBeInTheDocument()
  })

  it('redirects when there is no session at all', () => {
    renderGuardedRoute('authenticated')
    expect(screen.queryByText('Contenuto riservato')).not.toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })
})
