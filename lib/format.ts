// Formatting and parsing helpers shared by server and client code.

/** 45000 → "$450", 12050 → "$120.50" */
export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** For <input> values: 45000 → "450", 12050 → "120.50" */
export const dollarsInput = (cents: number): string => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));

/** "150", "$150.00", "1,200.5" → cents. Negative or junk → 0; capped at $100,000. */
export function parseCents(input: unknown): number {
  const s = String(input ?? '');
  if (s.includes('-')) return 0;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(Math.min(n, 100_000) * 100) : 0;
}

const dateFmt = (opts: Intl.DateTimeFormatOptions) => (ts: number) => new Date(ts * 1000).toLocaleString('en-US', opts);
/** "Tue, Jan 5 · 9:00 AM" */
export const when = (ts: number) => `${dateFmt({ weekday: 'short', month: 'short', day: 'numeric' })(ts)} · ${timeOf(ts)}`;
export const timeOf = dateFmt({ hour: 'numeric', minute: '2-digit' });
export const shortDate = dateFmt({ month: 'short', day: 'numeric' });
export const longDay = dateFmt({ weekday: 'long', month: 'long', day: 'numeric' });

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** What to call a client in a message: "Jane & Tom Smith" → "Jane & Tom", otherwise the first name. */
export function greetName(name: string): string {
  const m = name.trim().replace(/\s+/g, ' ').match(/^(.+?) (&|\+|and) (.+)$/i);
  return m ? `${firstName(m[1])} ${m[2].toLowerCase() === 'and' ? 'and' : '&'} ${firstName(m[3])}` : firstName(name);
}

/** Local calendar day (process TZ) as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** "2026-11-10" + "09:30" → unix seconds in local time, or null. */
export function parseLocal(date: string, time = '00:00'): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const ts = new Date(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]).getTime();
  return Number.isNaN(ts) ? null : Math.floor(ts / 1000);
}

export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return Math.floor(d.getTime() / 1000); };
