import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TOKEN_COOKIE_NAME, verifyAccessToken, type AuthUser } from './auth';

// Server-side session for Server Components (2026-10-01, performance phase 2): an authenticated
// page checks the JWT cookie while rendering on the server and redirects right there, instead of
// shipping a "Ładowanie sesji..." shell that waits for /api/auth/me before fetching anything.
// Same token, same verification as API routes (getAuthUserFromRequest) - just read via cookies().
export async function getServerSession(): Promise<AuthUser | null> {
  const token = (await cookies()).get(TOKEN_COOKIE_NAME)?.value?.trim();
  if (!token) {
    return null;
  }

  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

// For layouts/pages that require a logged-in user: redirects on the server (HTTP 307) otherwise.
export async function requireServerSession(): Promise<AuthUser> {
  const session = await getServerSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}
