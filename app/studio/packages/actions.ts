'use server';
// Owner actions on packages and sessions. Every action re-checks the session:
// Server Actions are public endpoints.
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/session.ts';
import { one, run, now, transaction } from '@/lib/db.ts';
import { text, int, list, done } from '@/lib/form.ts';
import { parseCents, parseLocal } from '@/lib/format.ts';
import { sendEmail } from '@/lib/email.ts';
import { config } from '@/lib/config.ts';
import { busy, getPackage, getSessions, getRules, markPaid, markSent, markUnpaid, newToken, rejectVenmoClaim, emailBody } from '@/lib/booking.ts';

const back = (form: FormData, fallback: string) => {
  const to = text(form, 'back', 200);
  return to.startsWith('/studio') ? to : fallback;   // only ever redirect within the app
};

/** Create or update a package and its scheduled dates. */
export async function savePackage(form: FormData): Promise<void> {
  await requireAdmin();
  const id = int(form, 'id', 0, 1e9, 0);
  const title = text(form, 'title', 120);
  if (!title) done(id ? `/studio/packages/${id}/edit` : '/studio/packages/new', 'Give the package a title.', 'err');

  let clientId = int(form, 'client_id', 0, 1e9, 0);
  const fields = {
    title, description: text(form, 'description', 2000), note: text(form, 'note', 2000),
    session_count: int(form, 'session_count', 1, 500, 1), session_minutes: int(form, 'session_minutes', 15, 480, 60),
    price_cents: parseCents(text(form, 'price', 20)),
  };
  // Dates: parallel lists from the session rows (blank rows ignored).
  const dates = list(form, 's_date'), times = list(form, 's_time'), ids = list(form, 's_id');
  const rows = dates.map((d, i) => ({ id: Number(ids[i]) || 0, startsAt: parseLocal(d, times[i] ?? '') })).filter((r) => r.startsAt !== null) as { id: number; startsAt: number }[];

  const savedId = transaction(() => {
    if (!clientId) {
      const name = text(form, 'new_name', 100);
      if (!name) return 0;
      clientId = Number(run('INSERT INTO clients (name, email, phone, created_at) VALUES (?, ?, ?, ?)', name, text(form, 'new_email', 200), text(form, 'new_phone', 40), now()).lastInsertRowid);
    }
    let pid = id;
    if (pid) {
      const existing = getPackage(pid);
      if (!existing) return 0;
      // The price is locked once paid.
      run(`UPDATE packages SET title = ?, description = ?, note = ?, session_count = ?, session_minutes = ?, price_cents = CASE WHEN status = 'paid' THEN price_cents ELSE ? END WHERE id = ?`,
        fields.title, fields.description, fields.note, fields.session_count, fields.session_minutes, fields.price_cents, pid);
    } else {
      pid = Number(run(`INSERT INTO packages (token, client_id, title, description, note, session_count, session_minutes, price_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newToken(), clientId, fields.title, fields.description, fields.note, fields.session_count, fields.session_minutes, fields.price_cents, now()).lastInsertRowid);
    }
    // Sync scheduled dates: update kept rows, add new ones, cancel removed future ones.
    const kept = new Set<number>();
    for (const r of rows) {
      if (r.id && one('SELECT 1 AS x FROM sessions WHERE id = ? AND package_id = ?', r.id, pid)) {
        run("UPDATE sessions SET starts_at = ?, minutes = ? WHERE id = ? AND status = 'scheduled'", r.startsAt, fields.session_minutes, r.id);
        kept.add(r.id);
      } else {
        kept.add(Number(run("INSERT INTO sessions (package_id, starts_at, minutes, location) VALUES (?, ?, ?, ?)", pid, r.startsAt, fields.session_minutes, getRules().location).lastInsertRowid));
      }
    }
    for (const s of getSessions(pid)) if (s.status === 'scheduled' && !kept.has(s.id)) run("UPDATE sessions SET status = 'cancelled' WHERE id = ?", s.id);
    return pid;
  });
  if (!savedId) done('/studio/packages/new', 'Pick a client or enter a new one.', 'err');
  done(`/studio/packages/${savedId}`, id ? 'Package saved.' : 'Package created — send it when you’re ready.');
}

export async function setPaid(form: FormData): Promise<void> {
  await requireAdmin();
  const id = int(form, 'id', 1, 1e9);
  if (text(form, 'undo', 5)) markUnpaid(id); else markPaid(id);
  redirect(back(form, `/studio/packages/${id}`));
}

export async function notReceived(form: FormData): Promise<void> {
  await requireAdmin();
  rejectVenmoClaim(int(form, 'id', 1, 1e9));
  refresh();
}

/** The owner sent the link some other way (their own Messages app, a DM…). */
export async function sent(form: FormData): Promise<void> {
  await requireAdmin();
  markSent(int(form, 'id', 1, 1e9));
  refresh();
}

export async function emailPackage(form: FormData): Promise<void> {
  await requireAdmin();
  const p = getPackage(int(form, 'id', 1, 1e9));
  if (!p) redirect('/studio');
  if (!p.client_email) done(`/studio/packages/${p.id}`, 'Add an email address for this client first.', 'err');
  const ok = await sendEmail({ to: p.client_email, subject: `${p.status === 'paid' ? 'Your sessions' : 'Your sessions + payment link'} — ${config.businessName}`, text: emailBody(p, getSessions(p.id)) });
  if (ok) markSent(p.id);
  done(`/studio/packages/${p.id}`, ok ? `Emailed to ${p.client_email}.` : 'The email didn’t go through. Check SMTP_URL.', ok ? 'ok' : 'err');
}

export async function setPackageStatus(form: FormData): Promise<void> {
  await requireAdmin();
  const id = int(form, 'id', 1, 1e9);
  const p = getPackage(id);
  if (!p) redirect('/studio');
  switch (text(form, 'to', 20)) {
    case 'withdraw':
      transaction(() => {
        run("UPDATE packages SET status = 'cancelled' WHERE id = ?", id);
        run("UPDATE sessions SET status = 'cancelled' WHERE package_id = ? AND status = 'scheduled' AND starts_at > ?", id, now());
      });
      done(`/studio/packages/${id}`, 'Package withdrawn — upcoming sessions were cancelled and the link shows it as closed.');
    case 'reopen':
      run("UPDATE packages SET status = CASE WHEN paid_at IS NOT NULL THEN 'paid' WHEN sent_at IS NOT NULL THEN 'sent' ELSE 'draft' END WHERE id = ? AND status = 'cancelled'", id);
      done(`/studio/packages/${id}`, 'Package reopened.');
    case 'delete':
      run('DELETE FROM packages WHERE id = ?', id);
      done(`/studio/clients/${p.client_id}`, 'Package deleted.');
  }
}

/** Mark a session done / cancelled / scheduled again. */
export async function setSessionStatus(form: FormData): Promise<void> {
  await requireAdmin();
  const sid = int(form, 'session_id', 1, 1e9);
  const status = text(form, 'status', 12);
  if (!['done', 'cancelled', 'scheduled'].includes(status)) return;
  const s = one<{ starts_at: number; minutes: number; status: string }>('SELECT starts_at, minutes, status FROM sessions WHERE id = ?', sid);
  if (!s) return;
  if (status === 'scheduled' && s.status === 'cancelled' && s.starts_at > now()) {
    // Restoring a cancelled future session: the time may have been taken since.
    const end = s.starts_at + s.minutes * 60;
    if (busy(s.starts_at, end).some(([bs, be]) => s.starts_at < be && end > bs)) done(back(form, '/studio'), 'That time is taken now (another booking or time off).', 'err');
  }
  run('UPDATE sessions SET status = ? WHERE id = ?', status, sid);
  redirect(back(form, '/studio'));
}

/** Log a session that happened (it counts toward the package right away). */
export async function logSession(form: FormData): Promise<void> {
  await requireAdmin();
  const p = getPackage(int(form, 'package_id', 1, 1e9));
  const startsAt = parseLocal(text(form, 'date', 10), text(form, 'time', 5) || '12:00');
  if (!p || startsAt === null) done(back(form, '/studio'), 'Pick a date for the session.', 'err');
  run("INSERT INTO sessions (package_id, starts_at, minutes, location, status) VALUES (?, ?, ?, ?, 'done')", p.id, startsAt, p.session_minutes, text(form, 'note', 100));
  done(back(form, `/studio/packages/${p.id}`), 'Session logged.');
}
