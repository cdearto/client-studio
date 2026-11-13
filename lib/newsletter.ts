// Newsletters: mailing list, unsubscribe links, and a send queue worked off in
// small batches (the Studio page drives it, so no background worker is needed).
import { createHmac } from 'node:crypto';
import { all, one, run, scalar, now, getSetting, transaction } from './db.ts';
import { config } from './config.ts';
import { sendEmail } from './email.ts';
import { cleanBlocks, renderHtml, renderText, type Brand, type Block } from './newsletter-render.ts';

export type Newsletter = { id: number; subject: string; preheader: string; blocks: Block[]; status: 'draft' | 'sending' | 'sent'; created_at: number; updated_at: number; sent_at: number | null };
type Row = Omit<Newsletter, 'blocks'> & { blocks: string };

const SOCIAL_LABELS: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', spotify: 'Spotify' };

export function brand(): Brand {
  return {
    businessName: config.businessName, siteUrl: config.siteUrl, siteHost: config.siteHost, address: mailingAddress(),
    social: Object.entries(config.socialLinks).map(([k, url]) => [SOCIAL_LABELS[k] ?? k, url]),
  };
}
/** Postal address for the footer. US law (CAN-SPAM) requires one, so sending stays locked until it's set. */
export const mailingAddress = () => getSetting('mailing_address').trim();

export function getNewsletter(id: number): Newsletter | undefined {
  const row = one<Row>('SELECT * FROM newsletters WHERE id = ?', id);
  return row && { ...row, blocks: cleanBlocks(row.blocks) };
}
export const listNewsletters = () =>
  all<Row & { delivered: number }>(`SELECT n.*, (SELECT COUNT(*) FROM newsletter_sends s WHERE s.newsletter_id = n.id AND s.status = 'sent') AS delivered
    FROM newsletters n ORDER BY COALESCE(n.sent_at, n.updated_at) DESC LIMIT 200`).map((r) => ({ ...r, blocks: cleanBlocks(r.blocks) }));

// ---- Subscribers -------------------------------------------------------------
export type Subscriber = { email: string; name: string; source: string; subscribed_at: number; unsubscribed_at: number | null };
export const normalizeEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
export const isEmail = (e: string) => e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * Adds someone to the list. A public signup never re-subscribes an address that
 * unsubscribed (anyone can type anyone's email); `reactivate` is for the owner
 * re-adding someone who asked, or the unsubscribe page's "stay subscribed".
 */
export function subscribe(email: string, name: string, source: string, reactivate = false): boolean {
  email = normalizeEmail(email);
  if (!isEmail(email)) return false;
  run('INSERT OR IGNORE INTO subscribers (email, name, source, subscribed_at) VALUES (?, ?, ?, ?)', email, name.trim().slice(0, 100), source, now());
  if (reactivate) run('UPDATE subscribers SET unsubscribed_at = NULL, subscribed_at = ? WHERE email = ? AND unsubscribed_at IS NOT NULL', now(), email);
  return true;
}
export const unsubscribe = (email: string) => run('UPDATE subscribers SET unsubscribed_at = ? WHERE email = ? AND unsubscribed_at IS NULL', now(), normalizeEmail(email)).changes > 0;
export const activeCount = () => scalar('SELECT COUNT(*) FROM subscribers WHERE unsubscribed_at IS NULL');
export const listSubscribers = (limit = 200) => all<Subscriber>('SELECT * FROM subscribers ORDER BY unsubscribed_at IS NOT NULL, subscribed_at DESC LIMIT ?', limit);

// ---- Unsubscribe links -------------------------------------------------------
export const unsubscribeToken = (email: string) => createHmac('sha256', config.secret).update(`${normalizeEmail(email)}|unsubscribe`).digest('hex').slice(0, 32);
export const unsubscribeUrl = (email: string) => `${config.siteUrl}/unsubscribe?${new URLSearchParams({ e: normalizeEmail(email), k: unsubscribeToken(email) })}`;
export const validUnsubscribe = (email: string, token: string) => email !== '' && token.length === 32 && unsubscribeToken(email) === token;

// ---- Sending -------------------------------------------------------------------
async function sendTo(n: Newsletter, email: string): Promise<boolean> {
  const unsub = unsubscribeUrl(email), b = brand();
  return sendEmail({
    to: email, subject: n.subject, text: renderText(n, b, unsub), html: renderHtml(n, b, unsub),
    fromName: `${config.ownerName} · ${config.businessName}`,
    // Lets Gmail and Apple Mail show their own Unsubscribe button (RFC 8058 one-click).
    headers: { 'List-Unsubscribe': `<${config.siteUrl}/api/unsubscribe?${new URLSearchParams({ e: email, k: unsubscribeToken(email) })}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  });
}
export const sendTest = (n: Newsletter, email: string) => sendTo(n, email);

/** Queues every active subscriber and marks the newsletter as sending. */
export function startSending(id: number): number {
  return transaction(() => {
    if (!run("UPDATE newsletters SET status = 'sending', sent_at = ? WHERE id = ? AND status = 'draft'", now(), id).changes) return 0;
    return Number(run("INSERT OR IGNORE INTO newsletter_sends (newsletter_id, email) SELECT ?, email FROM subscribers WHERE unsubscribed_at IS NULL", id).changes);
  });
}

export type Progress = { sent: number; failed: number; remaining: number; done: boolean };
export function progress(id: number): Progress {
  const count = (status: string) => scalar('SELECT COUNT(*) FROM newsletter_sends WHERE newsletter_id = ? AND status = ?', id, status);
  const remaining = count('queued');
  return { sent: count('sent'), failed: count('failed'), remaining, done: remaining === 0 };
}

/** Sends the next `size` queued emails. Rows are claimed before sending, so two open tabs never double-send. */
export async function sendBatch(id: number, size = 20): Promise<Progress> {
  const n = getNewsletter(id);
  if (!n || n.status === 'draft') return progress(id);
  const batch = transaction(() => {
    const rows = all<{ email: string }>("SELECT email FROM newsletter_sends WHERE newsletter_id = ? AND status = 'queued' LIMIT ?", id, size);
    for (const r of rows) run("UPDATE newsletter_sends SET status = 'failed' WHERE newsletter_id = ? AND email = ?", id, r.email);   // claimed; flipped to sent on success
    return rows;
  });
  for (const { email } of batch) {
    // Someone may have unsubscribed since the newsletter was queued.
    if (one('SELECT 1 AS x FROM subscribers WHERE email = ? AND unsubscribed_at IS NOT NULL', email)) { run('DELETE FROM newsletter_sends WHERE newsletter_id = ? AND email = ?', id, email); continue; }
    if (await sendTo(n, email)) run("UPDATE newsletter_sends SET status = 'sent', sent_at = ? WHERE newsletter_id = ? AND email = ?", now(), id, email);
  }
  const p = progress(id);
  if (p.done) run("UPDATE newsletters SET status = 'sent' WHERE id = ? AND status = 'sending'", id);
  return p;
}

/** Puts failed sends back in the queue. */
export function retryFailed(id: number): number {
  const changes = Number(run("UPDATE newsletter_sends SET status = 'queued' WHERE newsletter_id = ? AND status = 'failed'", id).changes);
  if (changes) run("UPDATE newsletters SET status = 'sending' WHERE id = ?", id);
  return changes;
}
