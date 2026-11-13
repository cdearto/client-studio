// Single-admin auth: an scrypt password hash in the environment and a signed,
// expiring session cookie. No session store.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { config } from './config.ts';

export const SESSION_COOKIE = 'studio_session';
const SESSION_DAYS = 30;   // stays signed in on a phone

// Format: scrypt:<salt>:<hash>, base64url. (No "$": Next's .env loader would expand it.)
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString('base64url')}:${scryptSync(password, salt, 32).toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(password, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Constant-time string comparison (for usernames). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// The signature covers the password hash, so changing the password signs out every session.
const sign = (expires: number) =>
  createHmac('sha256', config.secret).update(`${expires}|${config.passwordHash}`).digest('base64url');

export function createSessionToken(now = Date.now()): { value: string; expires: Date } {
  const expires = now + SESSION_DAYS * 86400_000;
  return { value: `${expires}.${sign(expires)}`, expires: new Date(expires) };
}

export function isValidSessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !config.passwordHash) return false;
  const [exp, sig] = token.split('.');
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < now || !sig) return false;
  return safeEqual(sig, sign(expires));
}
