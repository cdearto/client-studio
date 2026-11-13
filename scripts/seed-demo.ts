// Fills the database with realistic fake data so every Studio screen has something
// to show: templates, weekly hours, clients in every state (paid, awaiting
// payment, "Venmo sent", due to renew), past and upcoming sessions, subscribers
// and a draft newsletter. All names, emails and numbers are fictional.
//   npm run seed              add demo data (refuses if clients exist)
//   npm run seed -- --reset   wipe everything first
import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const { getDb, run, scalar, now, setSetting } = await import('../lib/db.ts');
const { newToken, saveRules } = await import('../lib/booking.ts');
const { starterLayouts } = await import('../lib/newsletter-render.ts');
const { brand } = await import('../lib/newsletter.ts');
const { config } = await import('../lib/config.ts');

const db = getDb();
if (process.argv.includes('--reset')) {
  for (const t of ['newsletter_sends', 'newsletters', 'subscribers', 'sessions', 'packages', 'clients', 'templates', 'hours', 'time_off', 'settings']) db.exec(`DELETE FROM ${t}`);
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

console.log(`Demo data added: ${people.length} clients, ${templates.length} templates, ${scalar('SELECT COUNT(*) FROM subscribers WHERE unsubscribed_at IS NULL')} subscribers.`);
