import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  type AuthUser,
  type AuthResult,
  type LoginResponse,
  login as authLogin,
  completeNewPassword as authCompleteNewPassword,
  logout as authLogout,
  isNewPasswordRequired,
  storeAuthData,
  getStoredUser,
  isAuthenticated as checkIsAuthenticated,
  fetchCurrentUser,
} from '../services/auth';

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

  // On mount, check if there's a stored session
  useEffect(() => {
    async function initAuth() {
      if (!checkIsAuthenticated()) {
        setIsLoading(false);
        return;
      }

      try {
        // Verify the token is still valid by fetching the user profile
        const currentUser = await fetchCurrentUser();
        setUser(currentUser);
      } catch {
        // Token is invalid or expired
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const result = await authLogin(email, password);

    // If it's a successful login (not a password challenge), store data
    if (!isNewPasswordRequired(result)) {
      const loginResult = result as LoginResponse;
      storeAuthData(loginResult);
      setUser(loginResult.user);
    }

    return result;
  }, []);

  const completeNewPassword = useCallback(
    async (email: string, newPassword: string, session: string): Promise<void> => {
      const result = await authCompleteNewPassword(email, newPassword, session);
      storeAuthData(result);
      setUser(result.user);
    },
    [],
  );

  const logout = useCallback(() => {
    authLogout();
    setUser(null);
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    completeNewPassword,
    logout,
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
