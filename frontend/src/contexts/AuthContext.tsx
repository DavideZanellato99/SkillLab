import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  type AuthUser,
  type AuthResult,
  type LoginResponse,
  login as authLogin,
  completeNewPassword as authCompleteNewPassword,
  logout as authLogout,
  isNewPasswordRequired,
  fetchCurrentUser,
} from '../services/auth';
import { useIdleLogout } from '../hooks/useIdleLogout';

// =====================================================
//  CONTEXT TYPE
// =====================================================

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  completeNewPassword: (email: string, newPassword: string, session: string) => Promise<void>;
  logout: () => void;
  /** Replace the in-memory user profile — used after a self-service profile edit. */
  updateUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// =====================================================
//  PROVIDER
// =====================================================

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, resume the cookie session (HttpOnly: JS can't inspect it,
  // asking the backend for the profile is the only way to know)
  useEffect(() => {
    async function initAuth() {
      try {
        const currentUser = await fetchCurrentUser();
        setUser(currentUser);
      } catch {
        // No valid session
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const result = await authLogin(email, password);

    // If it's a successful login (not a password challenge), the backend
    // has set the auth cookies — only the user profile reaches the JS
    if (!isNewPasswordRequired(result)) {
      setUser((result as LoginResponse).user);
    }

    return result;
  }, []);

  const completeNewPassword = useCallback(
    async (email: string, newPassword: string, session: string): Promise<void> => {
      const result = await authCompleteNewPassword(email, newPassword, session);
      setUser(result.user);
    },
    [],
  );

  const logout = useCallback(() => {
    // Fire-and-forget: the backend revokes the tokens and clears the
    // HttpOnly cookies
    void authLogout();
    setUser(null);
  }, []);

  // Session already killed elsewhere (another tab's idle logout): the
  // cookies are gone, only the local state needs to drop
  const dropLocalSession = useCallback(() => {
    setUser(null);
  }, []);

  // The backend is the source of truth for the profile — callers pass the
  // fresh object returned by the update-profile API instead of patching
  // fields locally
  const updateUser = useCallback((updated: AuthUser) => {
    setUser(updated);
  }, []);

  // Auto-logout after 30 minutes without user activity, in sync across
  // tabs: using one tab keeps the session alive in all of them
  useIdleLogout({
    enabled: !!user,
    onIdle: logout,
    onRemoteLogout: dropLocalSession,
  });

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    completeNewPassword,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// =====================================================
//  HOOK
// =====================================================

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
