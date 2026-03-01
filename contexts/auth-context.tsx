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
import {
  clearStoredToken,
  decodeJwtPayload,
  getStoredToken,
  setStoredToken,
} from '@/lib/auth-token';

type AuthUser = {
  userId: string;
  email: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: {
    email: string;
    name: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function resolveUser(token: string | null): AuthUser | null {
  if (!token) {
    return null;
  }

  const payload = decodeJwtPayload<{ sub?: string; email?: string }>(token);
  if (!payload?.sub || !payload.email) {
    return null;
  }

  return {
    userId: payload.sub,
    email: payload.email,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = getStoredToken();
    setToken(storedToken);
    setIsLoading(false);
  }, []);

  const login = useCallback(async (payload: { email: string; password: string }) => {
    const response = await apiClient.post<{ accessToken: string }>('/auth/login', payload);
    const nextToken = response.data.accessToken;
    setStoredToken(nextToken);
    setToken(nextToken);
  }, []);

  const register = useCallback(
    async (payload: { email: string; name: string; password: string }) => {
      const response = await apiClient.post<{ accessToken: string }>(
        '/auth/register',
        payload,
      );
      const nextToken = response.data.accessToken;
      setStoredToken(nextToken);
      setToken(nextToken);
    },
    [],
  );

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
  }, []);

  const user = useMemo(() => resolveUser(token), [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      isLoading,
      login,
      register,
      logout,
    }),
    [isLoading, login, logout, register, token, user],
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
