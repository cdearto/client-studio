'use server';
// The home page's newsletter signup. Bots get the same answer as everyone else:
// a filled honeypot or a busy IP is quietly dropped with a fake success.
import { headers } from 'next/headers';
import { overLimit } from '@/lib/db.ts';
import { text } from '@/lib/form.ts';
import { isEmail, normalizeEmail, subscribe } from '@/lib/newsletter.ts';
import { clientIp } from '@/lib/request.ts';

// The email comes back on an error so the form can refill it (React resets forms after an action).
export type SignUpState = { ok: true } | { ok: false; error: string; email: string } | null;

export async function signUp(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  if (text(form, 'website') !== '') return { ok: true };   // hidden field only bots fill in
  if (overLimit('signup', clientIp(await headers()), 6, 3600)) return { ok: true };   // 6 an hour per address
  const email = normalizeEmail(text(form, 'email', 300));
  if (!isEmail(email)) return { ok: false, error: 'That email doesn’t look right.', email: text(form, 'email', 300) };
  // Never re-subscribes someone who unsubscribed: anyone can type anyone's address.
  subscribe(email, '', 'signup');
  return { ok: true };
}
