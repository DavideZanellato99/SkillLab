import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  type AuthUser,
  type AuthResult,
  type LoginResponse,
  login as authLogin,
  completeNewPassword as authCompleteNewPassword,
  logout as authLogout,
  isNewPasswordRequired,
  fetchCurrentUser,
} from '../services/auth'
import { AuthContext, type AuthContextType } from './authContext'
import { useIdleLogout } from '../hooks/useIdleLogout'

// =====================================================
//  PROVIDER
// =====================================================

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  // On mount, resume the cookie session (HttpOnly: JS can't inspect it,
  // asking the backend for the profile is the only way to know)
  useEffect(() => {
    async function initAuth() {
      try {
        const currentUser = await fetchCurrentUser()
        setUser(currentUser)
      } catch {
        // No valid session
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const result = await authLogin(email, password)

    // If it's a successful login (not a password challenge), the backend
    // has set the auth cookies — only the user profile reaches the JS
    if (!isNewPasswordRequired(result)) {
      setUser((result as LoginResponse).user)
    }

    return result
  }, [])

  const completeNewPassword = useCallback(
    async (email: string, newPassword: string, session: string): Promise<void> => {
      const result = await authCompleteNewPassword(email, newPassword, session)
      setUser(result.user)
    },
    [],
  )

  /* La cache delle letture se ne va con la sessione. Le risposte già
   * scaricate (la galleria, gli elenchi di amministrazione) sono di chi le
   * ha chieste, e senza questo restavano in memoria per chi entra dopo
   * nella stessa scheda: un organization admin che entrava dopo il super
   * admin vedeva per un minuto gli avatar di tutte le organizzazioni,
   * perché la galleria trovava la chiave già piena e non chiedeva niente. */
  const forgetSession = useCallback(() => {
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const logout = useCallback(() => {
    // Fire-and-forget: the backend revokes the tokens and clears the
    // HttpOnly cookies
    void authLogout()
    forgetSession()
  }, [forgetSession])

  // Session already killed elsewhere (another tab's idle logout): the
  // cookies are gone, only the local state needs to drop
  const dropLocalSession = forgetSession

  // The backend is the source of truth for the profile — callers pass the
  // fresh object returned by the update-profile API instead of patching
  // fields locally
  const updateUser = useCallback((updated: AuthUser) => {
    setUser(updated)
  }, [])

  // Auto-logout after 30 minutes without user activity, in sync across
  // tabs: using one tab keeps the session alive in all of them
  useIdleLogout({
    enabled: !!user,
    onIdle: logout,
    onRemoteLogout: dropLocalSession,
  })

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    completeNewPassword,
    logout,
    updateUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
