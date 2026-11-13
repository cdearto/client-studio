import { reset, pkg, session, hours, day, at, client } from './setup.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clientBook, clientCancel, leftToBook, bookingBlock, canCancel, markPaid, markUnpaid, rejectVenmoClaim, getPackage, getPackageByToken,
  getRules, saveRules, feedKey, venmoUrl, paymentRef, smsBody, emailBody, e164, type Session } from '../lib/booking.ts';
import { all, now, run } from '../lib/db.ts';

beforeEach(reset);
const sessions = (id: number) => all<Session>('SELECT * FROM sessions WHERE package_id = ? ORDER BY starts_at', id);

test('happy path: a client books a session', async () => {
  const d = day(); hours(d, '09:00', '11:00'); saveRules({ location: 'Main Street studio' });
  const p = pkg();
  assert.deepEqual(await clientBook(p.id, at(d, '09:30')), { ok: true });
  const [s] = sessions(p.id);
  assert.equal(s.starts_at, at(d, '09:30'));
  assert.equal(s.booked_by_client, 1);
  assert.equal(s.location, 'Main Street studio');
  assert.equal(leftToBook(p), 4);
});

test('the same time cannot be booked twice, even by another client', async () => {
  const d = day(); hours(d, '09:00', '11:00');
  assert.equal((await clientBook(pkg().id, at(d, '09:00'))).ok, true);
  assert.deepEqual(await clientBook(pkg().id, at(d, '09:00')), { ok: false, reason: 'taken' });
});

test('forged or malformed times are rejected', async () => {
  const d = day(); hours(d, '09:00', '11:00');
  const p = pkg();
  for (const ts of [at(d, '09:10'), at(d, '07:00'), now() - 3600, now() + 400 * 86400, NaN])
    assert.deepEqual(await clientBook(p.id, ts), { ok: false, reason: 'taken' }, String(ts));
});

test('the package limit is enforced', async () => {
  const d = day(); hours(d, '09:00', '12:00');
  const p = pkg({ session_count: 1 });
  assert.equal((await clientBook(p.id, at(d, '09:00'))).ok, true);
  assert.deepEqual(await clientBook(p.id, at(d, '11:00')), { ok: false, reason: 'full' });
});

test('left to book counts scheduled and done, not cancelled, never negative', () => {
  const p = pkg({ session_count: 3 });
  session(p.id, at(day(), '09:00'), 60, 'done'); session(p.id, at(day(), '11:00')); session(p.id, at(day(), '13:00'), 60, 'cancelled');
  assert.equal(leftToBook(p), 1);
  session(p.id, at(day(2), '09:00')); session(p.id, at(day(3), '09:00'));
  assert.equal(leftToBook(p), 0);
});

test('payment gate: unpaid blocks, a Venmo claim opens, "not received" closes again', () => {
  hours(day(), '09:00', '10:00');
  const p = pkg({ status: 'sent' });
  assert.equal(bookingBlock(p), 'unpaid');
  run('UPDATE packages SET venmo_claimed_at = ? WHERE id = ?', now(), p.id);
  assert.equal(bookingBlock(getPackage(p.id)!), '');
  rejectVenmoClaim(p.id);
  assert.equal(bookingBlock(getPackage(p.id)!), 'unpaid');
  markPaid(p.id);
  assert.equal(bookingBlock(getPackage(p.id)!), '');
  saveRules({ require_paid: 0 });
  assert.equal(bookingBlock(pkg({ status: 'sent' })), '', 'rule switched off');
});

test('free packages can book without paying', () => {
  hours(day(), '09:00', '10:00');
  assert.equal(bookingBlock(pkg({ status: 'sent', price_cents: 0 })), '');
});

test('closed when switched off, withdrawn, or no hours', () => {
  assert.equal(bookingBlock(pkg()), 'closed', 'no hours');
  hours(day(), '09:00', '10:00');
  assert.equal(bookingBlock(pkg({ status: 'cancelled' })), 'closed');
  saveRules({ booking_on: 0 });
  assert.equal(bookingBlock(pkg()), 'closed');
});

test('booking re-reads the package inside the lock', async () => {
  const d = day(); hours(d, '09:00', '11:00');
  const p = pkg();
  run("UPDATE packages SET status = 'cancelled' WHERE id = ?", p.id);   // withdrawn after the page loaded
  assert.deepEqual(await clientBook(p.id, at(d, '09:00')), { ok: false, reason: 'closed' });
  assert.deepEqual(await clientBook(99999, at(d, '09:00')), { ok: false, reason: 'closed' });
});

test('cancel outside the window frees the slot and the credit', async () => {
  const d = day(); hours(d, '09:00', '10:00');
  const p = pkg();
  await clientBook(p.id, at(d, '09:00'));
  const [s] = sessions(p.id);
  assert.deepEqual(await clientCancel(p.id, s.id), { ok: true });
  assert.equal(leftToBook(p), 5);
  assert.equal((await clientBook(pkg().id, at(d, '09:00'))).ok, true, 'slot is free again');
  assert.deepEqual(await clientCancel(p.id, s.id), { ok: false, reason: 'gone' }, 'not twice');
});

test('cancel window boundary', async () => {
  hours(day(0), '00:00', '23:59');
  const p = pkg();
  const soon = session(p.id, now() + 23 * 3600), later = session(p.id, now() + 25 * 3600);
  assert.deepEqual(await clientCancel(p.id, soon), { ok: false, reason: 'late' });
  assert.deepEqual(await clientCancel(p.id, later), { ok: true });
  const s = { status: 'scheduled', starts_at: now() + 24 * 3600 + 5 } as Session;
  assert.equal(canCancel(s, getRules()), true);
  assert.equal(canCancel({ ...s, starts_at: now() + 24 * 3600 - 60 }, getRules()), false);
});

test("cannot cancel another client's or a non-scheduled session", async () => {
  hours(day(), '09:00', '10:00');
  const mine = pkg(), theirs = pkg();
  const theirSession = session(theirs.id, at(day(), '09:00'));
  const done = session(mine.id, at(day(5), '09:00'), 60, 'done');
  assert.deepEqual(await clientCancel(mine.id, theirSession), { ok: false, reason: 'gone' });
  assert.deepEqual(await clientCancel(mine.id, done), { ok: false, reason: 'gone' });
});

test('mark paid is idempotent; mark unpaid undoes it', () => {
  const p = pkg({ status: 'sent' });
  run('UPDATE packages SET sent_at = ? WHERE id = ?', now(), p.id);
  assert.equal(markPaid(p.id), true);
  assert.equal(markPaid(p.id), false);
  assert.equal(markUnpaid(p.id), true);
  assert.equal(getPackage(p.id)!.status, 'sent');
  const draft = pkg({ status: 'paid' });
  markUnpaid(draft.id);
  assert.equal(getPackage(draft.id)!.status, 'draft', 'never sent → draft');
});

test('package by token rejects malformed input', () => {
  const p = pkg();
  assert.equal(getPackageByToken(p.token)!.id, p.id);
  assert.equal(getPackageByToken(p.token)!.client_name, 'Jane Doe');
  for (const bad of ['', 'x', p.token.toUpperCase(), `${p.token}'`, '../etc']) assert.equal(getPackageByToken(bad), undefined, bad);
});

test('rules: defaults, numbers and unknown keys', () => {
  const r = getRules();
  assert.equal(r.buffer_min, 15);
  saveRules({ buffer_min: 5 });
  saveRules({ evil: 1 } as never);
  assert.equal(getRules().buffer_min, 5);
  assert.ok(!('evil' in getRules()));
});

test('feed key is random, stable and resettable', () => {
  const k = feedKey();
  assert.match(k, /^[a-f0-9]{24}$/);
  assert.equal(feedKey(), k);
  assert.notEqual(feedKey(true), k);
});

test('Venmo link, reference and messages', () => {
  const p = pkg({ title: '5-Pack & More', price_cents: 12050 });
  const url = new URL(venmoUrl(p));
  assert.equal(url.pathname, '/acme-studio');
  assert.equal(url.searchParams.get('amount'), '120.50');
  assert.equal(url.searchParams.get('note'), `Acme Studio - 5-Pack & More ${paymentRef(p)}`);
  assert.match(paymentRef(p), /^#[A-F0-9]{5}$/);
  assert.match(smsBody(p, false), /^Hi Jane, it's Sam from Acme Studio\. Here's your sessions: https:\/\/studio\.example\.com\/pay\/[a-f0-9]{32}$/);
  assert.match(smsBody(p, true), /pick your session times/);
  const couple = pkg({ client_id: client('Jane & Tom Smith') });
  assert.match(smsBody(couple, false), /^Hi Jane & Tom,/);
  const body = emailBody({ ...p, note: 'Bring water.' }, [{ starts_at: at('2027-01-05', '09:00'), minutes: 60, location: 'Springfield', status: 'scheduled' } as Session], false);
  for (const s of ['Hi Jane,', 'Bring water.', '5-Pack & More — $120.50', 'Tue, Jan 5 · 9:00 AM (60 min) — Springfield', p.token]) assert.ok(body.includes(s), s);
});

test('phone numbers to E.164', () => {
  assert.equal(e164('(555) 010-1234'), '+15550101234');
  assert.equal(e164('+44 20 7946 0958'), '+442079460958');
  assert.equal(e164('555-1234'), '');
});
