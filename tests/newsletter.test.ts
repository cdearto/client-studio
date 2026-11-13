import { reset } from './setup.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { cleanBlocks, hasContent, inline, renderHtml, renderText, starterLayouts, type Brand } from '../lib/newsletter-render.ts';
import { subscribe, unsubscribe, activeCount, unsubscribeToken, validUnsubscribe, unsubscribeUrl, startSending, sendBatch, retryFailed, progress, getNewsletter, brand } from '../lib/newsletter.ts';
import { run, now, setSetting, one } from '../lib/db.ts';

beforeEach(reset);
const B: Brand = { businessName: 'Acme Studio', siteUrl: 'https://studio.example.com', siteHost: 'studio.example.com', address: 'P.O. Box 1\nSpringfield', social: [['Instagram', 'https://instagram.com/acme']] };

test('unknown types and junk are dropped; fields whitelisted and clamped', () => {
  const b = cleanBlocks([null, 'x', { type: 'script' }, { type: 'heading', text: 'x'.repeat(500), size: 'huge', align: 'right' },
    { type: 'button', label: 'Go', url: 'javascript:alert(1)' }, { type: 'image', src: 'https://x.com/a.jpg', link: 'data:text/html,x' }]);
  assert.equal(b.length, 3);
  assert.deepEqual(b[0], { type: 'heading', text: 'x'.repeat(200), size: 'l', align: 'left' });
  assert.equal(b[1].type === 'button' && b[1].url, '');
  assert.equal(b[2].type === 'image' && b[2].link, '');
  assert.equal(cleanBlocks(Array(100).fill({ type: 'divider' })).length, 60);
  assert.deepEqual(cleanBlocks('not json'), []);
});

test('has content', () => {
  assert.equal(hasContent(cleanBlocks([{ type: 'heading', text: '' }, { type: 'divider' }])), false);
  assert.equal(hasContent(cleanBlocks([{ type: 'text', text: 'Hi' }])), true);
});

test('text is escaped; only http(s)/mailto links become links', () => {
  assert.equal(inline('<b>&'), '&lt;b&gt;&amp;');
  assert.equal(inline('**Bold** [site](https://x.com)'), '<strong style="color:#ffffff">Bold</strong> <a href="https://x.com" style="color:#ffffff;text-decoration:underline">site</a>');
  assert.ok(!inline('[x](javascript:alert(1))').includes('<a'));
  assert.ok(inline('see https://x.com.').endsWith('</a>.'), 'trailing punctuation stays outside');
  assert.equal((inline('[a](https://x.com)').match(/<a /g) ?? []).length, 1, 'a markdown link is not linked twice');
  assert.ok(!inline('"https://x.com/"onmouseover=alert(1)').includes('onmouseover=alert(1)"'));
});

test('the HTML email has subject, blocks, address and unsubscribe; previews hint at empty blocks', () => {
  const n = { subject: 'Summer <schedule>', preheader: 'New slots', blocks: cleanBlocks([{ type: 'heading', text: 'Hi' }, { type: 'text', text: 'One\n\nTwo' },
    { type: 'button', label: 'Book', url: 'https://x.com/b' }, { type: 'image', src: '' }, { type: 'social' }]) };
  const html = renderHtml(n, B, 'https://u/1');
  for (const s of ['<title>Summer &lt;schedule&gt;</title>', '>Hi</h1>', '>One</p>', '>Two</p>', 'href="https://x.com/b"', 'P.O. Box 1<br>Springfield', 'href="https://u/1"', 'Instagram'])
    assert.ok(html.includes(s), s);
  assert.ok(!html.includes('Image — paste'));
  assert.ok(renderHtml(n, B, 'https://u/1', true).includes('Image — paste'));
  const text = renderText(n, B, 'https://u/1');
  for (const s of ['HI', 'One\n\nTwo', 'Book: https://x.com/b', 'Instagram: https://instagram.com/acme', 'Unsubscribe: https://u/1']) assert.ok(text.includes(s), s);
});

test('starter layouts are valid blocks', () => {
  for (const l of Object.values(starterLayouts(B, 'Sam'))) assert.deepEqual(cleanBlocks(l.blocks), l.blocks);
});

test('social links come from config', () => {
  assert.deepEqual(brand().social.map(([l]) => l), ['Instagram', 'TikTok']);
});

test('unsubscribe tokens', () => {
  const t = unsubscribeToken('A@Example.com');
  assert.equal(t, unsubscribeToken('a@example.com'));
  assert.ok(validUnsubscribe('a@example.com', t));
  assert.ok(!validUnsubscribe('b@example.com', t));
  assert.ok(!validUnsubscribe('', ''));
  assert.ok(unsubscribeUrl('a@example.com').startsWith('https://studio.example.com/unsubscribe?e=a%40example.com&k='));
});

test('a public signup does not undo an unsubscribe; the owner re-adding does', () => {
  assert.ok(subscribe('A@example.com', 'A', 'signup'));
  assert.ok(!subscribe('not-an-email', '', 'signup'));
  assert.equal(activeCount(), 1);
  assert.ok(unsubscribe('a@example.com'));
  subscribe('a@example.com', '', 'signup');
  assert.equal(activeCount(), 0);
  subscribe('a@example.com', '', 'studio', true);
  assert.equal(activeCount(), 1);
});

test('the send queue: everyone once, unsubscribed skipped, failures retried', async () => {
  const outbox = `${process.env.DATA_DIR}/outbox.log`;
  if (existsSync(outbox)) rmSync(outbox);
  setSetting('mailing_address', 'P.O. Box 1');
  for (const e of ['a@example.com', 'b@example.com', 'c@example.com']) subscribe(e, '', 'signup');
  unsubscribe('c@example.com');
  const id = Number(run("INSERT INTO newsletters (subject, blocks, created_at, updated_at) VALUES ('Hi', ?, ?, ?)", JSON.stringify([{ type: 'text', text: 'Hello' }]), now(), now()).lastInsertRowid);
  assert.equal((await sendBatch(id)).sent, 0, 'drafts are not sent');
  assert.equal(startSending(id), 2);
  assert.equal(startSending(id), 0, 'idempotent');
  unsubscribe('b@example.com');   // mid-send
  const p = await sendBatch(id, 10);
  assert.deepEqual(p, { sent: 1, failed: 0, remaining: 0, done: true });
  assert.equal(getNewsletter(id)!.status, 'sent');
  const log = readFileSync(outbox, 'utf8');
  assert.ok(log.includes('To: a@example.com') && !log.includes('To: b@example.com'));
  run("INSERT INTO newsletter_sends (newsletter_id, email, status) VALUES (?, 'bad@example.com', 'failed')", id);
  assert.equal(retryFailed(id), 1);
  assert.equal(progress(id).remaining, 1);
  assert.equal(one<{ status: string }>('SELECT status FROM newsletters WHERE id = ?', id)!.status, 'sending');
});
