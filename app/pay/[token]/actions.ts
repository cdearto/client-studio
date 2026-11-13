'use server';
// Client actions from their private link: book a time, cancel a session, "I've sent it on Venmo".
// Only the token, a session id or a start time come from the form; everything else is re-loaded and re-checked.
import { redirect } from 'next/navigation';
import { claimVenmo, clientBook, clientCancel, getPackageByToken, type Package } from '@/lib/booking.ts';
import { overLimit } from '@/lib/db.ts';
import { dayKey } from '@/lib/format.ts';

const field = (form: FormData, key: string) => String(form.get(key) ?? '');

function packageFrom(form: FormData): Package {
  const p = getPackageByToken(field(form, 't'));
  if (!p) redirect('/pay/not-found');
  return p;
}

const back = (p: Package, msg: string, day = '') =>
  `/pay/${p.token}?msg=${msg}${day ? `&day=${day}` : ''}#book`;

/** Each booking or cancellation emails the owner, so cap the churn per package. */
const tooBusy = (p: Package) => overLimit('book', String(p.id), 20, 86400);

export async function book(form: FormData): Promise<void> {
  const p = packageFrom(form);
  if (tooBusy(p)) redirect(back(p, 'busy'));
  const ts = Number.parseInt(field(form, 'ts'), 10) || 0;
  let msg: string;
  try {
    const r = await clientBook(p.id, ts);
    msg = r.ok ? 'booked' : r.reason;
  } catch (e) {
    console.error('book failed', e);
    msg = 'error';
  }
  redirect(back(p, msg, msg === 'booked' || !ts ? '' : dayKey(new Date(ts * 1000))));
}

export async function cancel(form: FormData): Promise<void> {
  const p = packageFrom(form);
  if (tooBusy(p)) redirect(back(p, 'busy'));
  let msg: string;
  try {
    const r = await clientCancel(p.id, Number.parseInt(field(form, 'sid'), 10) || 0);
    msg = r.ok ? 'cancelled' : r.reason;
  } catch (e) {
    console.error('cancel failed', e);
    msg = 'error';
  }
  redirect(back(p, msg));
}

export async function claim(form: FormData): Promise<void> {
  const p = packageFrom(form);
  try {
    await claimVenmo(p);
  } catch (e) {
    console.error('venmo claim failed', e);
    redirect(back(p, 'error'));
  }
  redirect(`/pay/${p.token}`);
}
