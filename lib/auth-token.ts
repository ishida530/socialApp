"use client";

const TOKEN_KEY = 'flowstate_token';

export function getStoredToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  const fromLocalStorage = window.localStorage.getItem(TOKEN_KEY);
  if (fromLocalStorage) {
    return fromLocalStorage;
  }

  const cookieToken = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${TOKEN_KEY}=`))
    ?.split('=')[1];

  return cookieToken ? decodeURIComponent(cookieToken) : null;
}

export function setStoredToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=604800; samesite=lax`;
}

export function clearStoredToken() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; samesite=lax`;
}

export function decodeJwtPayload<T>(token: string): T | null {
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) {
      return null;
    }

    const padded = payloadBase64.padEnd(
      payloadBase64.length + ((4 - (payloadBase64.length % 4)) % 4),
      '=',
    );
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
