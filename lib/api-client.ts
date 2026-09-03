"use client";

import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
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

const DEFAULT_GET_TTL_MS = 20_000;
const NO_CACHE_GET_PATHS = ['/auth/me'];

type CachedResponse = {
  response: AxiosResponse;
  expiresAt: number;
};

const responseCache = new Map<string, CachedResponse>();
const inflightGetRequests = new Map<string, Promise<AxiosResponse>>();

function buildCacheKey(url: string, config?: AxiosRequestConfig) {
  const params = config?.params ? JSON.stringify(config.params) : '';
  const headers = config?.headers ? JSON.stringify(config.headers) : '';
  return `GET:${url}::params:${params}::headers:${headers}`;
}

function cloneResponse<T>(response: AxiosResponse<T>): AxiosResponse<T> {
  return {
    ...response,
    data: response.data,
    headers: { ...response.headers },
    config: { ...response.config },
  };
}

function shouldBypassGetCache(url: string) {
  return NO_CACHE_GET_PATHS.some((path) => url.startsWith(path));
}

function clearApiCache() {
  responseCache.clear();
  inflightGetRequests.clear();
}

const rawGet = apiClient.get.bind(apiClient);

async function cachedGet<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  if (shouldBypassGetCache(url)) {
    return rawGet<T>(url, config);
  }

  const key = buildCacheKey(url, config);
  const cached = responseCache.get(key);
  const now = Date.now();

  if (cached && now < cached.expiresAt) {
    return cloneResponse(cached.response as AxiosResponse<T>);
  }

  const inflight = inflightGetRequests.get(key);
  if (inflight) {
    return inflight as Promise<AxiosResponse<T>>;
  }

  const fetchPromise = rawGet<T>(url, config)
    .then((response) => {
      responseCache.set(key, {
        response: cloneResponse(response),
        expiresAt: Date.now() + DEFAULT_GET_TTL_MS,
      });
      return response;
    })
    .finally(() => {
      inflightGetRequests.delete(key);
    });

  inflightGetRequests.set(key, fetchPromise as Promise<AxiosResponse>);

  if (cached) {
    fetchPromise.catch(() => {
      // keep stale cache if revalidation fails
    });
    return cloneResponse(cached.response as AxiosResponse<T>);
  }

  return fetchPromise;
}

(apiClient.get as typeof cachedGet) = cachedGet;

apiClient.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (!['get', 'head', 'options'].includes(method)) {
    clearApiCache();
  }
  return config;
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

export { clearApiCache };
