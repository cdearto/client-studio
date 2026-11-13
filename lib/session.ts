// Server-only helpers that read the request (cookies, headers).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, isValidSessionToken } from './auth.ts';

export async function isSignedIn(): Promise<boolean> {
  return isValidSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Use at the top of any protected page, route or action. */
export async function requireAdmin(): Promise<void> {
  if (!(await isSignedIn())) redirect('/studio/login');
}
