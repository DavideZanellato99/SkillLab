/* La forma della sessione e il canale su cui viaggia.
 *
 * Separati dal provider perché il file che contiene JSX può esportare solo
 * componenti, altrimenti l'aggiornamento a caldo di Vite ricarica la pagina
 * intera a ogni salvataggio. Chi legge la sessione non passa comunque di qui:
 * usa `useAuth`, in hooks/. */

import { createContext } from 'react'
import type { AuthUser, AuthResult } from '../services/auth'

export interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<AuthResult>
  completeNewPassword: (email: string, newPassword: string, session: string) => Promise<void>
  logout: () => void
  /** Replace the in-memory user profile — used after a self-service profile edit. */
  updateUser: (user: AuthUser) => void
}

export const AuthContext = createContext<AuthContextType | null>(null)
