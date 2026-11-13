import './setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, parseCents, dollarsInput, plural, firstName, greetName, parseLocal, when } from '../lib/format.ts';
import { calendar, fold } from '../lib/ics.ts';

test('money', () => {
  assert.equal(money(45000), '$450');
  assert.equal(money(12050), '$120.50');
  assert.equal(money(120000), '$1,200');
  assert.equal(money(0), '$0');
});

test('parsing dollars to cents', () => {
  assert.equal(parseCents('150'), 15000);
  assert.equal(parseCents('$1,200.50'), 120050);
  assert.equal(parseCents('-5'), 0);
  assert.equal(parseCents('abc'), 0);
  assert.equal(parseCents('99999999'), 10_000_000, 'capped');
  assert.equal(dollarsInput(45000), '450');
  assert.equal(dollarsInput(12050), '120.50');
});

test('names and plurals', () => {
  assert.equal(plural(1, 'session'), '1 session');
  assert.equal(plural(3, 'session'), '3 sessions');
  assert.equal(firstName('  Jane   Doe '), 'Jane');
  assert.equal(greetName('Jane & Tom Smith'), 'Jane & Tom');
  assert.equal(greetName('jane and tom'), 'jane and tom');
  assert.equal(greetName('Jane Doe'), 'Jane');
});

test('local date + time parsing', () => {
  assert.equal(when(parseLocal('2027-01-05', '09:00')!), 'Tue, Jan 5 · 9:00 AM');
  assert.equal(parseLocal('2027-13-45', 'nope'), null);
  assert.equal(parseLocal('', ''), null);
});

test('ics escaping and folding', () => {
  const ics = calendar('Acme', [{ uid: 'x@y', start: 0, minutes: 60, summary: 'A, B; C\\D\nE' }]);
  assert.ok(ics.includes(String.raw`SUMMARY:A\, B\; C\\D E`));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  const long = `SUMMARY:${'Acme Studio — Private Sessions — '.repeat(10)}`;
  const folded = fold(long);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(folded.replaceAll('\r\n ', ''), long, 'unfolds to the original, multibyte characters intact');
});
