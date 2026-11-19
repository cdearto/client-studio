// Shared test environment and fixtures. Imported first by every test file.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

Object.assign(process.env, {
  DATA_DIR: mkdtempSync(join(tmpdir(), 'studio-test-')),
  BUSINESS_NAME: 'Acme Studio', OWNER_NAME: 'Sam', SITE_URL: 'https://studio.example.com',
  NOTIFY_EMAIL: 'owner@example.com', VENMO: 'acme-studio',
  SOCIAL_LINKS: 'instagram=https://www.instagram.com/acmestudio,tiktok=https://www.tiktok.com/@acmestudio',
  APP_SECRET: 'test-secret-test-secret-test-secret-0000',
});

const { getDb, run, now } = await import('../lib/db.ts');
const { getPackage, newToken, saveRules, slots } = await import('../lib/booking.ts');
const { dayKey, parseLocal } = await import('../lib/format.ts');

/** A clean database with deterministic rules: no notice period, a long horizon. */
export function reset(): void {
  for (const t of ['sessions', 'packages', 'clients', 'templates', 'hours', 'time_off', 'settings', 'newsletter_sends', 'newsletters', 'subscribers', 'attempts', 'hits'])
    getDb().exec(`DELETE FROM ${t}`);
  saveRules({ notice_hours: 0, days_ahead: 180 });
}

export function client(name = 'Jane Doe', email = 'jane@example.com', phone = '5550102001'): number {
  return Number(run('INSERT INTO clients (name, email, phone, created_at) VALUES (?, ?, ?, ?)', name, email, phone, now()).lastInsertRowid);
}

export function pkg(o: Partial<{ client_id: number; title: string; session_count: number; session_minutes: number; price_cents: number; status: string; venmo_claimed_at: number | null }> = {}) {
  const p = { title: '5-Pack', session_count: 5, session_minutes: 60, price_cents: 45000, status: 'paid', venmo_claimed_at: null, ...o };
  const clientId = p.client_id ?? client();
  const id = Number(run(`INSERT INTO packages (token, client_id, title, session_count, session_minutes, price_cents, status, venmo_claimed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, newToken(), clientId, p.title, p.session_count, p.session_minutes, p.price_cents, p.status, p.venmo_claimed_at, now()).lastInsertRowid);
  return getPackage(id)!;
}

export function session(packageId: number, startsAt: number, minutes = 60, status = 'scheduled'): number {
  return Number(run('INSERT INTO sessions (package_id, starts_at, minutes, status) VALUES (?, ?, ?, ?)', packageId, startsAt, minutes, status).lastInsertRowid);
}

/** Weekly hours on the weekday of `date`, e.g. hours('2026-11-24', '09:00', '11:00'). */
export function hours(date: string, from: string, to: string): void {
  const min = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  run('INSERT INTO hours (weekday, start_min, end_min) VALUES (?, ?, ?)', new Date(`${date}T12:00:00`).getDay(), min(from), min(to));
}

/** A date at least a week out, so "now" never interferes with slot math. */
export const day = (plus = 10) => { const d = new Date(); d.setDate(d.getDate() + plus); return dayKey(d); };
export const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return dayKey(d); };
export const at = (date: string, hm: string) => parseLocal(date, hm)!;
/** Open start times on `date` as "HH:MM". */
export const slotTimes = (date: string, minutes = 60) =>
  (slots(minutes)[date] ?? []).map((ts) => new Date(ts * 1000).toTimeString().slice(0, 5));
