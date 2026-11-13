'use server';
// The unsubscribe page's buttons. Public, so the signed link (e + k) is the only authority.
import { normalizeEmail, subscribe, unsubscribe, validUnsubscribe } from '@/lib/newsletter.ts';

export type UnsubState = 'confirm' | 'done' | 'back' | 'invalid';

export async function unsubscribeStep(_prev: UnsubState, form: FormData): Promise<UnsubState> {
  const email = normalizeEmail(form.get('e')), key = String(form.get('k') ?? '');
  if (!validUnsubscribe(email, key)) return 'invalid';
  if (form.get('do') === 'resubscribe') {
    subscribe(email, '', 'unsubscribe-page', true);   // "Stay subscribed": the link proves they own the address
    return 'back';
  }
  unsubscribe(email);
  return 'done';
}
