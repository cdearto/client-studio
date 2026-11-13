// Reading FormData in Server Actions. Everything from a form is untrusted text.
import { redirect } from 'next/navigation';

export const text = (form: FormData, key: string, max = 500): string => {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
};
export const int = (form: FormData, key: string, min: number, max: number, fallback = min): number => {
  const n = Number.parseInt(text(form, key, 20), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export const checked = (form: FormData, key: string): boolean => form.get(key) !== null;
export const list = (form: FormData, key: string): string[] => form.getAll(key).filter((v): v is string => typeof v === 'string');

/** Redirect with a one-line message the next page shows in <Notice />. */
export function done(path: string, message: string, kind: 'ok' | 'err' = 'ok'): never {
  const url = new URL(path, 'http://x');
  url.searchParams.set(kind === 'ok' ? 'notice' : 'error', message);
  redirect(`${url.pathname}${url.search}${url.hash}`);
}
