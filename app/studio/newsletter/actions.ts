'use server';
// Newsletter actions. Server Actions are public endpoints, so every one checks the
// session first, and arguments from the builder are treated as untrusted input.
import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { config } from '@/lib/config.ts';
import { now, run, setSetting } from '@/lib/db.ts';
import { done, int, text, checked } from '@/lib/form.ts';
import { cleanBlocks, hasContent, starterLayouts, type Block, type LayoutKey } from '@/lib/newsletter-render.ts';
import {
  activeCount, brand, getNewsletter, isEmail, mailingAddress, normalizeEmail, progress, retryFailed,
  sendBatch, sendTest, startSending, subscribe, unsubscribe, type Progress,
} from '@/lib/newsletter.ts';
import { requireAdmin } from '@/lib/session.ts';

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const LIST = '/studio/newsletter';
const GONE = 'This newsletter has already gone out — copy it into a new draft to edit.';
const formId = (form: FormData) => int(form, 'id', 0, Number.MAX_SAFE_INTEGER, 0);
const validId = (id: unknown): id is number => Number.isSafeInteger(id) && (id as number) > 0;

function insertDraft(subject: string, preheader: string, blocks: Block[]): number {
  const t = now();
  return Number(run("INSERT INTO newsletters (subject, preheader, blocks, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)",
    subject, preheader, JSON.stringify(cleanBlocks(blocks)), t, t).lastInsertRowid);
}

/** Starts a draft from one of the layouts on the "New newsletter" page. */
export async function createFromLayout(form: FormData): Promise<void> {
  await requireAdmin();
  const layouts = starterLayouts(brand(), config.ownerName);
  const key = text(form, 'layout', 20);
  const layout = Object.hasOwn(layouts, key) ? layouts[key as LayoutKey] : layouts.blank;
  redirect(`${LIST}/${insertDraft(layout.subject, '', layout.blocks)}`);
}

/** The builder's autosave. Only while still a draft: a tab left open must not change a newsletter that's sending. */
export async function autosave(id: number, draft: { subject: string; preheader: string; blocks: unknown }): Promise<Result> {
  await requireAdmin();
  if (!validId(id) || !draft || typeof draft !== 'object') return { ok: false, error: 'Couldn’t save.' };
  const field = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 150) : '');
  const changed = run("UPDATE newsletters SET subject = ?, preheader = ?, blocks = ?, updated_at = ? WHERE id = ? AND status = 'draft'",
    field(draft.subject), field(draft.preheader), JSON.stringify(cleanBlocks(draft.blocks)), now(), id).changes;
  return changed ? { ok: true } : { ok: false, error: GONE };
}

/** Copies any newsletter (draft or sent) into a new draft. */
export async function duplicate(form: FormData): Promise<void> {
  await requireAdmin();
  const n = getNewsletter(formId(form));
  if (!n) done(LIST, 'That newsletter no longer exists.', 'err');
  done(`${LIST}/${insertDraft(n.subject, n.preheader, n.blocks)}`, 'Copied into a new draft.');
}

export async function deleteDraft(form: FormData): Promise<void> {
  await requireAdmin();
  run("DELETE FROM newsletters WHERE id = ? AND status = 'draft'", formId(form));
  done(LIST, 'Draft deleted.');
}

/** Sends the saved draft to one address (the builder saves first). */
export async function sendTestEmail(id: number, to: string): Promise<Result> {
  await requireAdmin();
  const n = validId(id) ? getNewsletter(id) : undefined;
  if (!n) return { ok: false, error: 'That newsletter no longer exists.' };
  const email = normalizeEmail(to) || config.notifyEmail;
  if (!isEmail(email)) return { ok: false, error: 'That email doesn’t look right.' };
  if (!n.subject || !hasContent(n.blocks)) return { ok: false, error: 'Add a subject and some content first.' };
  return (await sendTest(n, email))
    ? { ok: true, message: `Test sent to ${email} — check that inbox (and spam).` }
    : { ok: false, error: 'The test didn’t send. Check the address and the email settings.' };
}

/** Queues every active subscriber. The page then shows the progress view, which drives sendNextBatch. */
export async function startSend(id: number): Promise<Result> {
  await requireAdmin();
  const n = validId(id) ? getNewsletter(id) : undefined;
  if (!n) return { ok: false, error: 'That newsletter no longer exists.' };
  if (n.status !== 'draft') return { ok: false, error: GONE };
  if (!n.subject || !hasContent(n.blocks)) return { ok: false, error: 'Add a subject and some content first.' };
  if (!mailingAddress()) return { ok: false, error: 'Add your mailing address on the Newsletter page first — the law requires it in every newsletter.' };
  if (!activeCount()) return { ok: false, error: 'No one is on the list yet.' };
  const queued = startSending(id);
  refresh();
  return { ok: true, message: `Sending to ${queued} subscribers.` };
}

/** Called over and over by the open progress view until done. */
export async function sendNextBatch(id: number): Promise<Progress> {
  await requireAdmin();
  if (!validId(id)) return { sent: 0, failed: 0, remaining: 0, done: true };
  const p = await sendBatch(id, 20);
  if (p.done) refresh();   // the page's status chip flips to "sent"
  return p;
}

export async function retryFailedSends(id: number): Promise<Progress> {
  await requireAdmin();
  if (!validId(id)) return { sent: 0, failed: 0, remaining: 0, done: true };
  retryFailed(id);
  refresh();
  return progress(id);
}

export async function saveMailingAddress(form: FormData): Promise<void> {
  await requireAdmin();
  setSetting('mailing_address', text(form, 'address', 300));
  done(LIST, 'Mailing address saved.');
}

export async function addSubscriber(form: FormData): Promise<void> {
  await requireAdmin();
  const email = normalizeEmail(text(form, 'email', 300));
  if (!isEmail(email)) done(LIST, 'That email doesn’t look right.', 'err');
  // Adding people who never asked is how a list gets marked as spam.
  if (!checked(form, 'consent')) done(LIST, 'Only add people who asked to join — tick the box to confirm.', 'err');
  subscribe(email, text(form, 'name', 100), 'studio', true);
  done(LIST, `${email} is on the list.`);
}

export async function removeSubscriber(form: FormData): Promise<void> {
  await requireAdmin();
  const email = normalizeEmail(text(form, 'email', 300));
  done(LIST, unsubscribe(email) ? `${email} unsubscribed.` : `${email} wasn’t on the list (or already unsubscribed).`);
}
