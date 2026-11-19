// Fills the database with realistic fake data so every Studio screen has something
// to show: templates, weekly hours, clients in every state (paid, awaiting
// payment, "Venmo sent", due to renew), past and upcoming sessions, subscribers,
// a draft newsletter and six months of website traffic. All names, emails and
// numbers are fictional.
//   npm run seed              add demo data (refuses if clients exist)
//   npm run seed -- --reset   wipe everything first
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const { getDb, run, scalar, now, setSetting } = await import('../lib/db.ts');
const { newToken, saveRules } = await import('../lib/booking.ts');
const { starterLayouts } = await import('../lib/newsletter-render.ts');
const { brand } = await import('../lib/newsletter.ts');
const { config } = await import('../lib/config.ts');
const { insertHit } = await import('../lib/tracking.ts');
const { dayKey } = await import('../lib/format.ts');

const db = getDb();
if (process.argv.includes('--reset')) {
  for (const t of ['hits', 'newsletter_sends', 'newsletters', 'subscribers', 'sessions', 'packages', 'clients', 'templates', 'hours', 'time_off', 'settings']) db.exec(`DELETE FROM ${t}`);
  db.exec('DELETE FROM sqlite_sequence');
} else if (scalar('SELECT COUNT(*) FROM clients') > 0) {
  console.log("There's already data here. Use --reset to replace it with demo data.");
  process.exit(1);
}
const id = (r: { lastInsertRowid: number | bigint }) => Number(r.lastInsertRowid);

// ---- Templates, hours, rules -------------------------------------------------
const templates: [string, string, number, number][] = [
  ['Intro Session', 'A one-off first session to get started.', 1, 7500], ['5-Pack', 'Five private sessions.', 5, 38000],
  ['10-Pack', 'Ten private sessions — best value.', 10, 72000], ['Duet 5-Pack', 'Five sessions for two people.', 5, 52000],
];
for (const [name, description, count, price] of templates)
  run('INSERT INTO templates (name, description, session_count, session_minutes, price_cents) VALUES (?, ?, ?, 60, ?)', name, description, count, price);
for (const wd of [1, 2, 3, 4, 5]) run('INSERT INTO hours (weekday, start_min, end_min) VALUES (?, ?, ?)', wd, 7 * 60, 12 * 60);
for (const wd of [2, 4]) run('INSERT INTO hours (weekday, start_min, end_min) VALUES (?, ?, ?)', wd, 16 * 60, 19 * 60);
run('INSERT INTO hours (weekday, start_min, end_min) VALUES (6, ?, ?)', 8 * 60, 11 * 60);
saveRules({ location: 'Main Street studio' });
const vacation = new Date(); vacation.setDate(vacation.getDate() + 21 + ((8 - vacation.getDay()) % 7)); vacation.setHours(0, 0, 0, 0);
run('INSERT INTO time_off (starts_at, ends_at, note) VALUES (?, ?, ?)', vacation.getTime() / 1000, vacation.getTime() / 1000 + 3 * 86400, 'Conference');

// ---- Clients and their packages ------------------------------------------------
type Person = { name: string; email: string; phone: string; template: string; price: number; status: 'draft' | 'sent' | 'paid'; done: number; upcoming: number; viewed?: boolean; venmo?: boolean; self?: boolean };
const people: Person[] = [
  { name: 'Jordan Rivera', email: 'jordan@example.com', phone: '(555) 010-2001', template: '10-Pack', price: 72000, status: 'paid', done: 6, upcoming: 2 },
  { name: 'Priya Shah', email: 'priya@example.com', phone: '(555) 010-2002', template: '5-Pack', price: 38000, status: 'paid', done: 4, upcoming: 1 },
  { name: 'Marcus Chen', email: 'marcus@example.com', phone: '(555) 010-2003', template: '5-Pack', price: 35000, status: 'paid', done: 5, upcoming: 0 },
  { name: 'Elena & Tom Novak', email: 'elena@example.com', phone: '(555) 010-2004', template: 'Duet 5-Pack', price: 52000, status: 'paid', done: 2, upcoming: 2 },
  { name: 'Aisha Bello', email: 'aisha@example.com', phone: '(555) 010-2005', template: '10-Pack', price: 72000, status: 'sent', done: 0, upcoming: 0, viewed: true },
  { name: 'Lucas Moreau', email: '', phone: '(555) 010-2006', template: '5-Pack', price: 40000, status: 'sent', done: 0, upcoming: 0, venmo: true },
  { name: 'Hannah Kim', email: 'hannah@example.com', phone: '(555) 010-2007', template: 'Intro Session', price: 7500, status: 'paid', done: 0, upcoming: 1, self: true },
  { name: 'Diego Alvarez', email: 'diego@example.com', phone: '(555) 010-2008', template: '10-Pack', price: 68000, status: 'paid', done: 9, upcoming: 0 },
  { name: "Grace O'Neill", email: 'grace@example.com', phone: '(555) 010-2009', template: '5-Pack', price: 38000, status: 'draft', done: 0, upcoming: 0 },
];
/** Local time `days` from today at hour:min, nudged off Sundays. */
const slot = (days: number, hour: number, min = 0) => {
  const d = new Date(); d.setDate(d.getDate() + days); if (d.getDay() === 0) d.setDate(d.getDate() + (days < 0 ? -1 : 1));
  d.setHours(hour, min, 0, 0); return d.getTime() / 1000;
};
const t = now();
people.forEach((p, i) => {
  const n = i + 1;
  const clientId = id(run('INSERT INTO clients (name, email, phone, notes, created_at) VALUES (?, ?, ?, ?, ?)', p.name, p.email, p.phone,
    n === 1 ? 'Prefers early mornings. Training for a half marathon.' : '', t - (90 - n * 7) * 86400));
  const [, description, count] = templates.find(([name]) => name === p.template)!;
  const created = t - (40 - n * 3) * 86400, sent = p.status === 'draft' ? null : created + 3600;
  const packageId = id(run(`INSERT INTO packages (token, client_id, title, description, note, session_count, session_minutes, price_cents, status,
      sent_at, viewed_at, venmo_claimed_at, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 60, ?, ?, ?, ?, ?, ?, ?)`,
    newToken(), clientId, p.template === '10-Pack' ? '10-Pack — Private Sessions' : p.template, description,
    n % 3 === 1 ? "So glad you're starting! Bring water and wear something comfortable." : '',
    count, p.price, p.status, sent, p.status === 'paid' || p.viewed || p.venmo ? (sent ?? t) + 1800 : null,
    p.venmo ? t - 5400 : null, p.status === 'paid' ? (n % 3 === 1 ? t - 86400 * (n % 5) : (sent ?? t) + 86400) : null, created));
  for (let k = 0; k < p.done; k++)
    run("INSERT INTO sessions (package_id, starts_at, minutes, location, status) VALUES (?, ?, 60, 'Main Street studio', 'done')", packageId, slot(-(p.done - k) * 4 - (n % 3), 8 + (n % 4)));
  for (let k = 0; k < p.upcoming; k++)
    run("INSERT INTO sessions (package_id, starts_at, minutes, location, status, booked_by_client) VALUES (?, ?, 60, 'Main Street studio', 'scheduled', ?)",
      packageId, slot(k * 3 + (n % 4) + 1, 7 + ((n * 2 + k) % 5), n % 2 ? 30 : 0), p.self ? 1 : 0);
});
// An earlier, finished package for the first client, so History has something in it.
const old = id(run("INSERT INTO packages (token, client_id, title, session_count, price_cents, status, sent_at, paid_at, created_at) VALUES (?, 1, '5-Pack', 5, 36000, 'paid', ?, ?, ?)",
  newToken(), t - 120 * 86400, t - 119 * 86400, t - 120 * 86400));
for (let k = 0; k < 5; k++) run("INSERT INTO sessions (package_id, starts_at, minutes, status) VALUES (?, ?, 60, 'done')", old, t - (115 - k * 10) * 86400);

// ---- Mailing list + a draft newsletter ---------------------------------------------
const names = ['alex', 'sam', 'riley', 'casey', 'morgan', 'taylor', 'jamie', 'quinn', 'avery', 'drew', 'robin', 'kai', 'noor', 'lena', 'omar', 'ines', 'yuki', 'ben', 'zoe', 'max'];
names.forEach((f, n) => {
  for (const suffix of ['', '.k']) {
    const ts = t - ((n * 37 + suffix.length * 11) % 200 + 1) * 86400;
    run('INSERT OR IGNORE INTO subscribers (email, name, source, subscribed_at, unsubscribed_at) VALUES (?, ?, ?, ?, ?)',
      `${f}${suffix}@example.com`, f[0].toUpperCase() + f.slice(1), n % 3 ? 'signup' : 'studio', ts, n === 4 && suffix ? ts + 10 * 86400 : null);
  }
});
setSetting('mailing_address', `${config.businessName}\n123 Main Street, Springfield, ST 00000`);
const monthly = starterLayouts(brand(), config.ownerName).monthly;
run("INSERT INTO newsletters (subject, preheader, blocks, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  monthly.subject, 'Open spots, new hours and what’s coming up', JSON.stringify(monthly.blocks), t - 7200, t - 3600);

// ---- Website traffic for Analytics: ~180 days, growing, quieter on Sundays ---------
// Deterministic randomness, so every seed looks the same.
let state = 42;
const rand = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T extends string>(weights: Record<T, number>): T => {
  const entries = Object.entries(weights) as [T, number][];
  let r = rand() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return entries[0][0];
};
const sources = { Instagram: 34, Google: 26, Direct: 22, Facebook: 7, Yelp: 6, newsletter: 5 };
const referrers: Record<string, string> = { Instagram: 'https://l.instagram.com/', Google: 'https://www.google.com/', Facebook: 'https://m.facebook.com/', Yelp: 'https://www.yelp.com/' };
const devices = { Mobile: 72, Desktop: 24, Tablet: 4 };
const places = { 'United States|CA|Springfield': 40, 'United States|CA|Shelbyville': 18, 'United States|CA|Capital City': 12, 'United States|NV|Ogdenville': 5, 'Canada||Toronto': 2 };
const clicks = { signup: 30, book: 25, email: 12, phone: 10, instagram: 18, none: 420 };
let hits = 0;
db.exec('BEGIN');
for (let d = 179; d >= 0; d--) {
  const day0 = new Date(); day0.setHours(0, 0, 0, 0); day0.setDate(day0.getDate() - d);
  let base = 8 + (179 - d) * 0.09;
  if (day0.getDay() === 0) base *= 0.55;
  if (d === 9) base *= 2.4;   // the day a newsletter went out
  const visitors = Math.max(1, Math.round(base * (0.8 + rand() * 0.4)));
  for (let v = 0; v < visitors; v++) {
    const device = pick(devices);
    const [country, region, city] = pick(places).split('|');
    const source = d === 9 && rand() < 0.6 ? 'newsletter' : pick(sources);
    const who = { visitor: `demo-${d}-${v}`, device, browser: device === 'Desktop' ? 'Chrome' : 'Safari', os: device === 'Desktop' ? 'macOS' : 'iOS', country, region, city, isBot: false };
    let ts = day0.getTime() / 1000 + 7 * 3600 + Math.floor(rand() * 14 * 3600);
    const views = rand() > 0.6 ? 2 : 1;
    for (let k = 0; k < views; k++, ts += 40) {
      insertHit({ ...who, ts, day: dayKey(new Date(ts * 1000)), type: 'pageview', name: '', path: '/',
        referrer: k ? config.siteUrl : referrers[source] ?? '', source: k ? 'Internal' : source });
      hits++;
    }
    const click = pick(clicks);
    if (click !== 'none') { insertHit({ ...who, ts, day: dayKey(new Date(ts * 1000)), type: 'event', name: click, path: '/', referrer: '', source: 'Internal' }); hits++; }
  }
}
db.exec('COMMIT');

console.log(`Demo data added: ${people.length} clients, ${templates.length} templates, ${scalar('SELECT COUNT(*) FROM subscribers WHERE unsubscribed_at IS NULL')} subscribers, ${hits.toLocaleString('en-US')} website hits.`);
