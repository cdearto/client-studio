import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { config } from './config.ts';

let db: DatabaseSync | undefined;

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 10000;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  -- Presets that pre-fill a new package.
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    session_count INTEGER NOT NULL DEFAULT 1, session_minutes INTEGER NOT NULL DEFAULT 60, price_cents INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );
  -- What a client buys: N sessions at their own price, reached by a private link (token).
  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    session_count INTEGER NOT NULL DEFAULT 1, session_minutes INTEGER NOT NULL DEFAULT 60, price_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
    sent_at INTEGER, viewed_at INTEGER,
    venmo_claimed_at INTEGER,     -- client tapped "I've sent it on Venmo"
    venmo_rejected_at INTEGER,    -- owner tapped "Not received": the claim no longer unlocks booking
    paid_at INTEGER, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    starts_at INTEGER NOT NULL, minutes INTEGER NOT NULL DEFAULT 60, location TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'cancelled')),
    booked_by_client INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(starts_at);
  CREATE INDEX IF NOT EXISTS idx_packages_client ON packages(client_id);
  -- Bookable weekly hours (minutes after midnight) and blocked-out time.
  CREATE TABLE IF NOT EXISTS hours (id INTEGER PRIMARY KEY AUTOINCREMENT, weekday INTEGER NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS time_off (id INTEGER PRIMARY KEY AUTOINCREMENT, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS subscribers (
    email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
    subscribed_at INTEGER NOT NULL, unsubscribed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS newsletters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL DEFAULT '', preheader TEXT NOT NULL DEFAULT '', blocks TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sent_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS newsletter_sends (
    newsletter_id INTEGER NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE, email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')), sent_at INTEGER,
    PRIMARY KEY (newsletter_id, email)
  );
  -- One row per recent attempt, for login throttling and public-form rate limits.
  CREATE TABLE IF NOT EXISTS attempts (scope TEXT NOT NULL, key TEXT NOT NULL, ts INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_attempts ON attempts(scope, key, ts);
`;

/** The single SQLite connection (Node's built-in driver). Creates the schema on first use. */
export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  db = new DatabaseSync(`${config.dataDir}/studio.sqlite`);
  db.exec(SCHEMA);
  return db;
}

// node:sqlite returns null-prototype rows; copy them into plain objects so they
// compare normally and can be passed to client components.
const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

export const all = <T>(sql: string, ...params: SQLInputValue[]): T[] => getDb().prepare(sql).all(...params).map((r) => plain<T>(r));
export const one = <T>(sql: string, ...params: SQLInputValue[]): T | undefined => {
  const row = getDb().prepare(sql).get(...params);
  return row ? plain<T>(row) : undefined;
};
export const run = (sql: string, ...params: SQLInputValue[]) => getDb().prepare(sql).run(...params);
/** A single number from a COUNT/SUM query. */
export const scalar = (sql: string, ...params: SQLInputValue[]): number => Number(Object.values(getDb().prepare(sql).get(...params) ?? { n: 0 })[0] ?? 0);

/** Runs fn inside a write transaction that holds the lock from the start (no lost updates). */
export function transaction<T>(fn: () => T): T {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export const now = () => Math.floor(Date.now() / 1000);

export function getSetting(key: string, fallback = ''): string {
  return one<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? fallback;
}
export function setSetting(key: string, value: string | number): void {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}

/** Count one attempt and report whether `key` is now over `limit` within `windowSec`. */
export function overLimit(scope: string, key: string, limit: number, windowSec: number): boolean {
  const t = now();
  run('INSERT INTO attempts (scope, key, ts) VALUES (?, ?, ?)', scope, key, t);
  if (Math.random() < 0.02) run('DELETE FROM attempts WHERE ts < ?', t - 86400);
  return scalar('SELECT COUNT(*) FROM attempts WHERE scope = ? AND key = ? AND ts > ?', scope, key, t - windowSec) > limit;
}
export const clearAttempts = (scope: string, key: string) => run('DELETE FROM attempts WHERE scope = ? AND key = ?', scope, key);
