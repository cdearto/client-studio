// Queries for Studio → Analytics. Bots are always excluded.
import { all, getDb, one } from './db.ts';
import { dayKey } from './format.ts';

export type Row = { label: string; count: number };
export type DayPoint = { day: string; pageviews: number; visitors: number; events: number };
export type Totals = { visitors: number; pageviews: number; conversions: number; conversionRate: number; pagesPerVisitor: number };
export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

/** A ?range= value → 7, 30 or 90 (30 for anything else). */
export const toRange = (asked: unknown): Range => RANGES.find((r) => r === Number(asked)) ?? 30;

const daysAgo = (n: number, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() - n); return dayKey(d); };

/** Inclusive day range for "the last N days", and the same-length period before it. */
export function periods(range: Range, today = new Date()) {
  return {
    current: { from: daysAgo(range - 1, today), to: dayKey(today) },
    previous: { from: daysAgo(2 * range - 1, today), to: daysAgo(range, today) },
  };
}

export function totals(from: string, to: string, conversionEvents: string[]): Totals {
  const visits = one<{ pageviews: number; visitors: number }>(`SELECT COUNT(*) AS pageviews, COUNT(DISTINCT visitor) AS visitors
    FROM hits WHERE type = 'pageview' AND is_bot = 0 AND day BETWEEN ? AND ?`, from, to)!;
  const placeholders = conversionEvents.map(() => '?').join(',') || "''";
  const conversions = Number(one<{ n: number }>(`SELECT COUNT(*) AS n FROM hits
    WHERE type = 'event' AND is_bot = 0 AND day BETWEEN ? AND ? AND name IN (${placeholders})`, from, to, ...conversionEvents)?.n ?? 0);
  return {
    pageviews: Number(visits.pageviews), visitors: Number(visits.visitors), conversions,
    conversionRate: visits.visitors ? (100 * conversions) / Number(visits.visitors) : 0,
    pagesPerVisitor: visits.visitors ? Number(visits.pageviews) / Number(visits.visitors) : 0,
  };
}

/** One point per day, including days with no traffic. */
export function daily(from: string, to: string): DayPoint[] {
  const rows = all<{ day: string; pageviews: number; visitors: number; events: number }>(`SELECT day, SUM(type = 'pageview') AS pageviews,
      COUNT(DISTINCT CASE WHEN type = 'pageview' THEN visitor END) AS visitors, SUM(type = 'event') AS events
    FROM hits WHERE is_bot = 0 AND day BETWEEN ? AND ? GROUP BY day`, from, to);
  const byDay = new Map(rows.map((r) => [r.day, { day: r.day, pageviews: Number(r.pageviews), visitors: Number(r.visitors), events: Number(r.events) }]));
  const out: DayPoint[] = [];
  for (const d = new Date(`${from}T12:00:00`); dayKey(d) <= to; d.setDate(d.getDate() + 1)) {
    const day = dayKey(d);
    out.push(byDay.get(day) ?? { day, pageviews: 0, visitors: 0, events: 0 });
  }
  return out;
}

// Each breakdown is a fixed query (no column names from user input).
const BREAKDOWNS = {
  pages:     `SELECT path AS label, COUNT(*) AS count FROM hits WHERE type = 'pageview' AND is_bot = 0 AND day BETWEEN ? AND ? GROUP BY path`,
  // Where visits came from, not clicks between your own pages.
  sources:   `SELECT source AS label, COUNT(*) AS count FROM hits WHERE type = 'pageview' AND is_bot = 0 AND source <> 'Internal' AND day BETWEEN ? AND ? GROUP BY source`,
  events:    `SELECT name AS label, COUNT(*) AS count FROM hits WHERE type = 'event' AND is_bot = 0 AND day BETWEEN ? AND ? GROUP BY name`,
  devices:   `SELECT device AS label, COUNT(*) AS count FROM hits WHERE type = 'pageview' AND is_bot = 0 AND day BETWEEN ? AND ? GROUP BY device`,
  countries: `SELECT country AS label, COUNT(DISTINCT visitor) AS count FROM hits WHERE type = 'pageview' AND is_bot = 0 AND country <> '' AND day BETWEEN ? AND ? GROUP BY country`,
  cities:    `SELECT city || CASE WHEN region <> '' THEN ', ' || region ELSE '' END AS label, COUNT(DISTINCT visitor) AS count
              FROM hits WHERE type = 'pageview' AND is_bot = 0 AND city <> '' AND day BETWEEN ? AND ? GROUP BY label`,
} as const;
export type Breakdown = keyof typeof BREAKDOWNS;

export function breakdown(kind: Breakdown, from: string, to: string, limit = 8): Row[] {
  return getDb().prepare(`${BREAKDOWNS[kind]} ORDER BY count DESC LIMIT ?`).all(from, to, limit)
    .map((r) => ({ label: String(r.label ?? ''), count: Number(r.count) }));
}

/** Percentage change, or null when there's nothing to compare against. */
export function change(now: number, before: number): number | null {
  return before === 0 ? null : Math.round((100 * (now - before)) / before);
}

/** New subscribers (still on the list) who joined within the range. */
export function newSubscribers(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`).getTime() / 1000;
  const end = new Date(`${to}T00:00:00`); end.setDate(end.getDate() + 1);
  return Number(one<{ n: number }>('SELECT COUNT(*) AS n FROM subscribers WHERE unsubscribed_at IS NULL AND subscribed_at >= ? AND subscribed_at < ?',
    start, end.getTime() / 1000)?.n ?? 0);
}
