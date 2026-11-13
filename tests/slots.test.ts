import { reset, pkg, session, hours, day, addDays, at, slotTimes } from './setup.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { slots, bookingOpen, saveRules } from '../lib/booking.ts';
import { run } from '../lib/db.ts';

beforeEach(reset);

test('no hours: no slots, booking closed', () => {
  assert.deepEqual(slots(60), {});
  assert.equal(bookingOpen(), false);
});

test('step-aligned starts that fit the session', () => {
  const d = day(); hours(d, '09:00', '11:00');
  assert.deepEqual(slotTimes(d, 60), ['09:00', '09:30', '10:00'], '10:00 ends exactly at 11:00; 10:30 would overrun');
  assert.deepEqual(slotTimes(d, 30), ['09:00', '09:30', '10:00', '10:30']);
});

test('a session longer than the window yields nothing', () => {
  const d = day(); hours(d, '09:00', '09:45');
  assert.deepEqual(slotTimes(d), []);
});

test('step setting', () => {
  const d = day(); hours(d, '09:00', '11:00'); saveRules({ step_min: 60 });
  assert.deepEqual(slotTimes(d), ['09:00', '10:00']);
});

test('only the matching weekday gets slots', () => {
  const d = day(); hours(d, '09:00', '10:00');
  assert.deepEqual(slotTimes(d), ['09:00']);
  assert.deepEqual(slotTimes(addDays(d, 1)), []);
  assert.deepEqual(slotTimes(addDays(d, 7)), ['09:00']);
});

test('overlapping ranges do not duplicate slots', () => {
  const d = day(); hours(d, '09:00', '11:00'); hours(d, '10:00', '12:00');
  assert.deepEqual(slotTimes(d), ['09:00', '09:30', '10:00', '10:30', '11:00']);
});

test('the buffer pads existing sessions', () => {
  const d = day(); hours(d, '09:00', '12:00');
  session(pkg().id, at(d, '09:00'));
  assert.deepEqual(slotTimes(d), ['10:30', '11:00'], 'busy 08:45–10:15 with the default 15-min buffer');
  saveRules({ buffer_min: 0 });
  assert.deepEqual(slotTimes(d), ['10:00', '10:30', '11:00']);
});

test('cancelled sessions and withdrawn packages do not block; done sessions do', () => {
  const d = day(); hours(d, '09:00', '10:00');
  session(pkg().id, at(d, '09:00'), 60, 'cancelled');
  session(pkg({ status: 'cancelled' }).id, at(d, '09:00'));
  assert.deepEqual(slotTimes(d), ['09:00']);
  session(pkg().id, at(d, '09:00'), 60, 'done');
  assert.deepEqual(slotTimes(d), []);
});

test('all-day and partial time off', () => {
  const d = day(), d2 = addDays(d, 7);
  hours(d, '09:00', '11:00');
  run('INSERT INTO time_off (starts_at, ends_at) VALUES (?, ?)', at(d, '00:00'), at(addDays(d, 1), '00:00'));
  run('INSERT INTO time_off (starts_at, ends_at) VALUES (?, ?)', at(d2, '09:30'), at(d2, '10:00'));
  assert.deepEqual(slotTimes(d), []);
  assert.deepEqual(slotTimes(d2), ['10:00'], '09:00 and 09:30 overlap 09:30–10:00');
});

test('notice excludes times too soon', () => {
  saveRules({ notice_hours: 48 });
  hours(day(0), '00:00', '23:59'); hours(day(1), '00:00', '23:59'); hours(day(2), '00:00', '23:59');
  const all = Object.values(slots(60)).flat();
  assert.ok(all.length > 0);
  assert.ok(Math.min(...all) >= Date.now() / 1000 + 48 * 3600);
});

test('horizon limit', () => {
  saveRules({ days_ahead: 5 });
  const near = day(3), far = day(12);
  hours(near, '09:00', '10:00'); hours(far, '09:00', '10:00');
  const s = slots(60);
  assert.ok(near in s);
  assert.ok(!(far in s));
});

test('single-day mode matches the full scan and respects the horizon', () => {
  const d = day(); hours(d, '09:00', '12:00');
  session(pkg().id, at(d, '10:00'), 30);
  assert.deepEqual(slots(60, d), { [d]: slots(60)[d] });
  assert.deepEqual(slots(60, day(-1)), {});
  saveRules({ days_ahead: 5 });
  assert.deepEqual(slots(60, d), {}, 'beyond the booking horizon');
});

test('spring forward keeps wall-clock times', () => {
  // US DST starts Sunday 2027-03-14.
  const nowMs = new Date('2027-03-01T12:00:00').getTime();
  hours('2027-03-14', '09:00', '10:00');
  assert.deepEqual(slots(60, undefined, undefined, nowMs)['2027-03-14'], [at('2027-03-14', '09:00')]);
  run('DELETE FROM hours');
  hours('2027-03-14', '01:00', '04:00');
  const ts = slots(30, undefined, undefined, nowMs)['2027-03-14'];
  assert.deepEqual(ts, [...new Set(ts)].sort((a, b) => a - b), 'no duplicate starts, sorted');
});

test('slots never spill past the end of the hours (or midnight)', () => {
  const d = day(); hours(d, '22:00', '23:59');
  assert.deepEqual(slotTimes(d, 90), ['22:00']);
});
