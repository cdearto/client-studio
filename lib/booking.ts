// The booking engine: packages, booking rules, open time slots, client
// self-booking and cancellation, payment state, and the messages clients get.
import { randomBytes } from 'node:crypto';
import { all, one, run, scalar, transaction, now, getSetting, setSetting } from './db.ts';
import { config } from './config.ts';
import { dayKey, firstName, greetName, money, plural, when } from './format.ts';
import { sendEmail } from './email.ts';

export type PackageStatus = 'draft' | 'sent' | 'paid' | 'cancelled';
export type Package = {
  id: number; token: string; client_id: number; title: string; description: string; note: string;
  session_count: number; session_minutes: number; price_cents: number; status: PackageStatus;
  sent_at: number | null; viewed_at: number | null; venmo_claimed_at: number | null; venmo_rejected_at: number | null;
  paid_at: number | null; created_at: number;
  client_name: string; client_email: string; client_phone: string;
};
export type Session = {
  id: number; package_id: number; starts_at: number; minutes: number; location: string;
  status: 'scheduled' | 'done' | 'cancelled'; booked_by_client: number;
};

const PACKAGE_SQL = `SELECT p.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone
  FROM packages p JOIN clients c ON c.id = p.client_id`;
export const getPackage = (id: number) => one<Package>(`${PACKAGE_SQL} WHERE p.id = ?`, id);
export const getPackageByToken = (token: string) =>
  /^[a-f0-9]{32}$/.test(token) ? one<Package>(`${PACKAGE_SQL} WHERE p.token = ?`, token) : undefined;
export const getSessions = (packageId: number) => all<Session>('SELECT * FROM sessions WHERE package_id = ? ORDER BY starts_at', packageId);
export const newToken = () => randomBytes(16).toString('hex');

// ---- Booking rules (changed in Studio → Hours) ----------------------------
export const DEFAULT_RULES = {
  booking_on: 1,     // clients can book from their link
  require_paid: 1,   // …only once paid (or they've said "I've sent it on Venmo")
  notice_hours: 12,  // earliest bookable time = now + this
  days_ahead: 30,    // how far out clients can book
  buffer_min: 15,    // gap kept before and after every session
  step_min: 30,      // start times offered every N minutes
  cancel_hours: 24,  // clients can cancel up to N hours before
};
export type Rules = typeof DEFAULT_RULES & { location: string };

export function getRules(): Rules {
  const rules = { ...DEFAULT_RULES, location: getSetting('location') };
  for (const key of Object.keys(DEFAULT_RULES) as (keyof typeof DEFAULT_RULES)[]) {
    const v = getSetting(key);
    if (v !== '') rules[key] = Number(v);
  }
  return rules;
}
export function saveRules(r: Partial<Rules>): void {
  for (const [k, v] of Object.entries(r)) if (k === 'location' || k in DEFAULT_RULES) setSetting(k, v);
}
/** Booking is open once it's switched on and some weekly hours exist. */
export const bookingOpen = (rules = getRules()) => rules.booking_on === 1 && scalar('SELECT COUNT(*) FROM hours') > 0;

// ---- Usage ------------------------------------------------------------------
export const usedCount = (packageId: number) => scalar("SELECT COUNT(*) FROM sessions WHERE package_id = ? AND status = 'done'", packageId);

/** Sessions of a package that are neither done nor booked yet. */
export const leftToBook = (p: Pick<Package, 'id' | 'session_count'>) =>
  Math.max(0, p.session_count - scalar("SELECT COUNT(*) FROM sessions WHERE package_id = ? AND status IN ('scheduled', 'done')", p.id));

export type Block = '' | 'closed' | 'unpaid' | 'full';
/** Why this client can't book right now ('' = they can). */
export function bookingBlock(p: Package, rules = getRules()): Block {
  if (!bookingOpen(rules) || p.status === 'cancelled') return 'closed';
  // "I've sent it" opens booking on trust, unless the owner marked that claim "not received".
  const trustedClaim = p.venmo_claimed_at !== null && p.venmo_rejected_at === null;
  if (rules.require_paid && p.price_cents > 0 && p.status !== 'paid' && !trustedClaim) return 'unpaid';
  if (leftToBook(p) === 0) return 'full';
  return '';
}

// ---- Availability -----------------------------------------------------------
type Interval = [start: number, end: number];

/** Busy intervals overlapping [from, to): active sessions (padded by the buffer) and time off. */
export function busy(from: number, to: number, rules = getRules()): Interval[] {
  const pad = rules.buffer_min * 60;
  const sessions = all<{ starts_at: number; minutes: number }>(`SELECT s.starts_at, s.minutes FROM sessions s JOIN packages p ON p.id = s.package_id
    WHERE s.status IN ('scheduled', 'done') AND p.status <> 'cancelled' AND s.starts_at < ? AND s.starts_at + s.minutes * 60 > ?`, to + pad, from - pad);
  const off = all<{ starts_at: number; ends_at: number }>('SELECT starts_at, ends_at FROM time_off WHERE starts_at < ? AND ends_at > ?', to, from);
  return [
    ...sessions.map((s): Interval => [s.starts_at - pad, s.starts_at + s.minutes * 60 + pad]),
    ...off.map((o): Interval => [o.starts_at, o.ends_at]),
  ];
}

/**
 * Open start times for a session of `minutes`, by day: { 'YYYY-MM-DD': [unix seconds…] }.
 * Weekly hours minus the notice period, time off and existing sessions.
 * Times are built from the local wall clock, so DST days come out right.
 * Pass `onlyDay` to compute a single day (used to validate a booking).
 */
export function slots(minutes: number, onlyDay?: string, rules = getRules(), nowMs = Date.now()): Record<string, number[]> {
  const hours = all<{ weekday: number; start_min: number; end_min: number }>('SELECT weekday, start_min, end_min FROM hours ORDER BY start_min');
  if (hours.length === 0) return {};
  const earliest = nowMs / 1000 + rules.notice_hours * 3600;
  const step = Math.max(5, rules.step_min);
  const today = new Date(nowMs); today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i <= rules.days_ahead; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    if (!onlyDay || dayKey(d) === onlyDay) days.push(d);
  }
  if (days.length === 0) return {};
  const last = new Date(days[days.length - 1]); last.setDate(last.getDate() + 1);
  const taken = busy(days[0].getTime() / 1000, last.getTime() / 1000, rules);

  const out: Record<string, number[]> = {};
  for (const d of days) {
    const times = new Set<number>();
    for (const h of hours.filter((x) => x.weekday === d.getDay())) {
      for (let m = h.start_min; m + minutes <= h.end_min; m += step) {
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60).getTime() / 1000;
        const end = start + minutes * 60;
        if (start >= earliest && !taken.some(([bs, be]) => start < be && end > bs)) times.add(start);
      }
    }
    if (times.size) out[dayKey(d)] = [...times].sort((a, b) => a - b);
  }
  return out;
}

// ---- Client actions ---------------------------------------------------------
export type Result = { ok: true } | { ok: false; reason: 'closed' | 'unpaid' | 'full' | 'taken' | 'gone' | 'late' };

/** A client books one session. Everything is re-checked inside the write lock, so two clients can't take the same time. */
export async function clientBook(packageId: number, startsAt: number): Promise<Result> {
  const rules = getRules();
  if (startsAt < now() || startsAt > now() + (rules.days_ahead + 1) * 86400) return { ok: false, reason: 'taken' };
  const outcome = transaction((): Result & { p?: Package; minutes?: number } => {
    const p = getPackage(packageId);
    if (!p) return { ok: false, reason: 'closed' };
    const block = bookingBlock(p, rules);
    if (block) return { ok: false, reason: block };
    const minutes = Math.max(15, p.session_minutes || 60);
    const open = slots(minutes, dayKey(new Date(startsAt * 1000)), rules)[dayKey(new Date(startsAt * 1000))] ?? [];
    if (!open.includes(startsAt)) return { ok: false, reason: 'taken' };
    run("INSERT INTO sessions (package_id, starts_at, minutes, location, status, booked_by_client) VALUES (?, ?, ?, ?, 'scheduled', 1)",
      p.id, startsAt, minutes, rules.location);
    return { ok: true, p, minutes };
  });
  if (!outcome.ok || !outcome.p) return outcome;
  const { p, minutes } = outcome;
  await sendEmail({
    to: config.notifyEmail, replyTo: p.client_email || undefined,
    subject: `Booked: ${p.client_name} — ${when(startsAt)}`,
    text: `${p.client_name} booked a session: ${when(startsAt)} (${minutes} min).\n\nPackage: ${p.title} — ${leftToBook(p)} left to book.\n${studioUrl(p.id)}\n`,
  });
  await sendEmail({
    to: p.client_email, subject: `You're booked: ${when(startsAt)} — ${config.businessName}`,
    text: `Hi ${firstName(p.client_name)},\n\nYou're booked for ${when(startsAt)} (${minutes} min)${rules.location ? ` at ${rules.location}` : ''}.\n\n`
      + `Your sessions and booking page:\n${payUrl(p)}\n\n`
      + (rules.cancel_hours ? `Need to change it? Cancel from that page up to ${rules.cancel_hours} hours before.\n\n` : '')
      + `See you soon,\n${config.ownerName}\n${config.businessName}\n`,
  });
  return { ok: true };
}

export const canCancel = (s: Session, rules = getRules()) => s.status === 'scheduled' && s.starts_at - now() >= rules.cancel_hours * 3600;

/** A client cancels one of their sessions, outside the cancellation window. */
export async function clientCancel(packageId: number, sessionId: number): Promise<Result> {
  const rules = getRules();
  const p = getPackage(packageId);
  if (!p || p.status === 'cancelled' || !bookingOpen(rules)) return { ok: false, reason: 'closed' };
  const s = one<Session>("SELECT * FROM sessions WHERE id = ? AND package_id = ? AND status = 'scheduled'", sessionId, p.id);
  if (!s) return { ok: false, reason: 'gone' };
  if (!canCancel(s, rules)) return { ok: false, reason: 'late' };
  // Re-check status and window in the UPDATE itself, so a concurrent change can't slip through.
  const { changes } = run("UPDATE sessions SET status = 'cancelled' WHERE id = ? AND status = 'scheduled' AND starts_at >= ?", s.id, now() + rules.cancel_hours * 3600);
  if (!changes) return { ok: false, reason: 'gone' };
  await sendEmail({
    to: config.notifyEmail, replyTo: p.client_email || undefined,
    subject: `Cancelled: ${p.client_name} — ${when(s.starts_at)}`,
    text: `${p.client_name} cancelled their session on ${when(s.starts_at)}. It's back in their package to rebook.\n\n${studioUrl(p.id)}\n`,
  });
  return { ok: true };
}

/** Client says they've paid on Venmo: flags the package for the owner (one email per package). */
export async function claimVenmo(p: Package): Promise<void> {
  if (p.status === 'paid' || p.status === 'cancelled' || !config.venmo) return;
  const { changes } = run('UPDATE packages SET venmo_claimed_at = ? WHERE id = ? AND venmo_claimed_at IS NULL', now(), p.id);
  if (!changes) return;
  await sendEmail({
    to: config.notifyEmail, replyTo: p.client_email || undefined,
    subject: `Venmo to check: ${p.client_name} — ${money(p.price_cents)}`,
    text: `${p.client_name} says they sent ${money(p.price_cents)} on Venmo for "${p.title}".\n\n`
      + `Look for a payment to @${config.venmo} with ${paymentRef(p)} in the note, then mark it paid:\n${studioUrl(p.id)}\n`,
  });
}

// ---- Payment state (owner) ------------------------------------------------------
export const markPaid = (id: number) => run("UPDATE packages SET status = 'paid', paid_at = ? WHERE id = ? AND status <> 'paid'", now(), id).changes > 0;
/** Undo "paid" (tapped by mistake): back to unpaid, or draft if it was never sent. */
export const markUnpaid = (id: number) =>
  run("UPDATE packages SET status = CASE WHEN sent_at IS NULL THEN 'draft' ELSE 'sent' END, paid_at = NULL WHERE id = ? AND status = 'paid'", id).changes > 0;
/** "Not received": the claim stops unlocking booking until the owner marks it paid. */
export const rejectVenmoClaim = (id: number) => run('UPDATE packages SET venmo_rejected_at = ? WHERE id = ? AND venmo_claimed_at IS NOT NULL', now(), id);
export const markSent = (id: number) =>
  run("UPDATE packages SET sent_at = COALESCE(sent_at, ?), status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END WHERE id = ?", now(), id);

// ---- Links & messages -------------------------------------------------------------
export const payUrl = (p: Pick<Package, 'token'>) => `${config.siteUrl}/pay/${p.token}`;
const studioUrl = (id: number) => `${config.siteUrl}/studio/packages/${id}`;
/** Short code for the Venmo note, so a payment can be matched to its package. */
export const paymentRef = (p: Pick<Package, 'token'>) => `#${p.token.slice(0, 5).toUpperCase()}`;

/** Venmo pay link with amount and note pre-filled (opens the app on phones). */
export function venmoUrl(p: Pick<Package, 'token' | 'title' | 'price_cents'>): string {
  const q = new URLSearchParams({ txn: 'pay', audience: 'private', amount: (p.price_cents / 100).toFixed(2), note: `${config.businessName} - ${p.title} ${paymentRef(p)}` });
  return `https://venmo.com/${encodeURIComponent(config.venmo)}?${q.toString().replaceAll('+', '%20')}`;
}

/** US-centric E.164: "(555) 010-1234" → "+15550101234"; '' if there's no area code. */
export function e164(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length < 10 ? '' : d.length === 10 ? `+1${d}` : `+${d}`;
}

/** An sms: link that opens Messages with the text ready. */
export const smsLink = (phone: string, body: string) => `sms:${e164(phone)}?&body=${encodeURIComponent(body)}`;

export function smsBody(p: Package, open = bookingOpen()): string {
  const what = p.status === 'paid'
    ? open ? 'your package — pick your session times here' : 'your sessions'
    : open ? 'your package — pay and pick your session times here' : 'your package and payment link';
  return `Hi ${greetName(p.client_name)}, it's ${config.ownerName} from ${config.businessName}. Here's ${what}: ${payUrl(p)}`;
}

export function emailBody(p: Package, sessions: Session[], open = bookingOpen()): string {
  const scheduled = sessions.filter((s) => s.status !== 'cancelled')
    .map((s) => `  • ${when(s.starts_at)} (${s.minutes} min)${s.location ? ` — ${s.location}` : ''}`);
  return [
    `Hi ${firstName(p.client_name)},`, '',
    ...(p.note.trim() ? [p.note.trim(), ''] : []),
    `${p.title} — ${money(p.price_cents)}`, plural(p.session_count, 'session'), '',
    'Scheduled:', scheduled.length ? scheduled.join('\n') : '  (dates to be scheduled together)', '',
    `${p.status === 'paid' ? 'View your sessions' : 'Review and pay'}${open ? ', and book your session times,' : ''} here:`, payUrl(p), '',
    `See you soon,`, config.ownerName, config.businessName, config.notifyEmail, '',
  ].join('\n');
}

/** Private key for the owner's calendar feed. Random and stored, so it can be reset if it leaks. */
export function feedKey(reset = false): string {
  let k = reset ? '' : getSetting('feed_key');
  if (!k) { k = randomBytes(12).toString('hex'); setSetting('feed_key', k); }
  return k;
}
