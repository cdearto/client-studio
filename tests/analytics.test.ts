import { reset } from './setup.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { breakdown, change, daily, newSubscribers, periods, toRange, totals } from '../lib/analytics.ts';
import { run } from '../lib/db.ts';
import { dayKey } from '../lib/format.ts';
import { insertHit, type Hit } from '../lib/tracking.ts';

const hit = (o: Partial<Hit>): Hit => ({
  ts: 0, day: '2026-11-10', type: 'pageview', name: '', path: '/', referrer: '', source: 'Direct', visitor: 'v1',
  device: 'Desktop', browser: 'Chrome', os: 'macOS', country: '', region: '', city: '', isBot: false, ...o,
});
beforeEach(reset);

test('totals: visitors, conversions and rates; bots excluded', () => {
  insertHit(hit({ visitor: 'a' })); insertHit(hit({ visitor: 'a', path: '/pricing' })); insertHit(hit({ visitor: 'b' }));
  insertHit(hit({ visitor: 'a', type: 'event', name: 'signup' }));
  insertHit(hit({ visitor: 'b', type: 'event', name: 'instagram' }));         // a click, not a conversion
  insertHit(hit({ visitor: 'bot', isBot: true }));
  insertHit(hit({ visitor: 'c', day: '2026-11-01' }));                         // outside the range
  const t = totals('2026-11-05', '2026-11-10', ['signup', 'book']);
  assert.deepEqual(t, { pageviews: 3, visitors: 2, conversions: 1, conversionRate: 50, pagesPerVisitor: 1.5 });
  assert.equal(totals('2026-11-05', '2026-11-10', []).conversions, 0, 'no conversion events configured');
  assert.deepEqual(totals('2026-12-01', '2026-12-07', ['signup']), { pageviews: 0, visitors: 0, conversions: 0, conversionRate: 0, pagesPerVisitor: 0 });
});

test('daily fills empty days', () => {
  insertHit(hit({ day: '2026-11-08' })); insertHit(hit({ day: '2026-11-10', visitor: 'x' })); insertHit(hit({ day: '2026-11-10', visitor: 'y' }));
  assert.deepEqual(daily('2026-11-08', '2026-11-10').map((d) => [d.day, d.pageviews, d.visitors]),
    [['2026-11-08', 1, 1], ['2026-11-09', 0, 0], ['2026-11-10', 2, 2]]);
});

test('daily stays on calendar days across DST', () => {
  assert.deepEqual(daily('2026-10-31', '2026-11-02').map((d) => d.day), ['2026-10-31', '2026-11-01', '2026-11-02']);
});

test('breakdowns: sources exclude internal clicks; cities count visitors', () => {
  insertHit(hit({ source: 'Google' })); insertHit(hit({ source: 'Google' })); insertHit(hit({ source: 'Internal' })); insertHit(hit({ source: 'Instagram' }));
  assert.deepEqual(breakdown('sources', '2026-11-01', '2026-11-30'), [{ label: 'Google', count: 2 }, { label: 'Instagram', count: 1 }]);
  insertHit(hit({ visitor: 'a', city: 'Austin', region: 'TX' })); insertHit(hit({ visitor: 'a', city: 'Austin', region: 'TX' }));
  insertHit(hit({ visitor: 'b', city: 'Paris' }));
  assert.deepEqual(breakdown('cities', '2026-11-01', '2026-11-30').sort((x, y) => x.label.localeCompare(y.label)),
    [{ label: 'Austin, TX', count: 1 }, { label: 'Paris', count: 1 }]);
});

test('periods and ranges', () => {
  const p = periods(7, new Date('2026-11-13T12:00:00'));
  assert.deepEqual(p, { current: { from: '2026-11-07', to: '2026-11-13' }, previous: { from: '2026-10-31', to: '2026-11-06' } });
  assert.equal(toRange('90'), 90);
  for (const bad of [undefined, '', 'abc', '365', '-7']) assert.equal(toRange(bad), 30, String(bad));
});

test('change', () => {
  assert.equal(change(110, 100), 10);
  assert.equal(change(50, 100), -50);
  assert.equal(change(5, 0), null);
});

test('new subscribers in the range, still on the list', () => {
  const at = (d: string) => new Date(`${d}T09:00:00`).getTime() / 1000;
  run('INSERT INTO subscribers (email, subscribed_at) VALUES (?, ?)', 'in@example.com', at('2026-11-10'));
  run('INSERT INTO subscribers (email, subscribed_at) VALUES (?, ?)', 'edge@example.com', new Date('2026-11-13T23:59:00').getTime() / 1000);
  run('INSERT INTO subscribers (email, subscribed_at) VALUES (?, ?)', 'before@example.com', at('2026-11-01'));
  run('INSERT INTO subscribers (email, subscribed_at, unsubscribed_at) VALUES (?, ?, ?)', 'gone@example.com', at('2026-11-10'), at('2026-11-11'));
  assert.equal(newSubscribers('2026-11-07', '2026-11-13'), 2);
  assert.equal(dayKey(new Date('2026-11-13T23:59:00')), '2026-11-13');
});
