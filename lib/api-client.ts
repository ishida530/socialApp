"use client";

import axios from 'axios';
import { toast } from 'sonner';

type ApiValidationError = {
  message?: string;
  errors?: string[];
};

const baseURL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '/api';

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const statusCode = error?.response?.status as number | undefined;
    const requestUrl = error?.config?.url as string | undefined;
    const data = error?.response?.data as ApiValidationError | undefined;

    if (statusCode === 400) {
      const validationErrors = data?.errors ?? [];
      if (validationErrors.length > 0) {
        validationErrors.forEach((message) => toast.error(message));
      } else {
        toast.error(data?.message ?? 'Nieprawidłowe dane wejściowe.');
      }
    }

    if (statusCode === 401 && typeof window !== 'undefined') {
      const isSessionProbe = requestUrl?.includes('/auth/me');
      const isPublicAuthPage =
        window.location.pathname.startsWith('/login') ||
        window.location.pathname.startsWith('/register');

      if (isSessionProbe || isPublicAuthPage) {
        return Promise.reject(error);
      }

      if (!window.location.pathname.startsWith('/login')) {
        toast.error('Sesja wygasła. Zaloguj się ponownie.');
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  },
);
