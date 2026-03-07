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

  const refreshSession = useCallback(async () => {
    try {
      const response = await apiClient.get<{ user: AuthUser }>('/auth/me');
      setUser(response.data.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      await refreshSession();
      setIsLoading(false);
    };

    void bootstrap();
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
      login,
      register,
      logout,
    }),
    [isLoading, login, logout, register, user],
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
