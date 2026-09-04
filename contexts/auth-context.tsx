"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiClient } from '@/lib/api-client';

type AuthUser = {
  userId: string;
  email: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionError: boolean;
  retrySession: () => void;
  login: (payload: {
    email: string;
    password: string;
    hpWebsite?: string;
    formStartedAt?: number;
  }) => Promise<void>;
  register: (payload: {
    email: string;
    name: string;
    password: string;
    hpWebsite?: string;
    formStartedAt?: number;
  }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const response = await apiClient.get<{ user: AuthUser }>('/auth/me');
      setUser(response.data.user);
      setSessionError(false);
    } catch (error: unknown) {
      setUser(null);
      // A 401 here just means "not logged in" — expected, not an error state.
      // Anything else (timeout, network failure, 5xx) is a real connectivity
      // problem: surface it instead of leaving the caller stuck on a loading
      // state that will never resolve on its own.
      const status = (error as { response?: { status?: number } })?.response?.status;
      setSessionError(status !== 401);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      await refreshSession();
      setIsLoading(false);
    };

    void bootstrap();
  }, [refreshSession]);

  const retrySession = useCallback(() => {
    setIsLoading(true);
    void refreshSession().finally(() => setIsLoading(false));
  }, [refreshSession]);

  const login = useCallback(async (payload: {
    email: string;
    password: string;
    hpWebsite?: string;
    formStartedAt?: number;
  }) => {
    await apiClient.post('/auth/login', payload);
    await refreshSession();
  }, [refreshSession]);

  const register = useCallback(
    async (payload: {
      email: string;
      name: string;
      password: string;
      hpWebsite?: string;
      formStartedAt?: number;
    }) => {
      await apiClient.post('/auth/register', payload);
      await refreshSession();
    },
    [refreshSession],
  );

  const logout = useCallback(() => {
    const run = async () => {
      try {
        await apiClient.post('/auth/logout');
      } finally {
        setUser(null);
      }
    };

    void run();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      sessionError,
      retrySession,
      login,
      register,
      logout,
    }),
    [isLoading, sessionError, retrySession, login, logout, register, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
