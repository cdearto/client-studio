'use server';
import { refresh } from 'next/cache';
import { requireAdmin } from '@/lib/session.ts';
import { run } from '@/lib/db.ts';
import { text, int, list, checked, done } from '@/lib/form.ts';
import { parseLocal } from '@/lib/format.ts';
import { saveRules, feedKey } from '@/lib/booking.ts';

const minutes = (hm: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

export async function addHours(form: FormData): Promise<void> {
  await requireAdmin();
  const from = minutes(text(form, 'from', 5)), to = minutes(text(form, 'to', 5));
  const days = [...new Set(list(form, 'days').map(Number).filter((d) => d >= 0 && d <= 6))];
  if (from === null || to === null || to <= from || !days.length) done('/studio/hours', 'Pick at least one day and a start time before the end time.', 'err');
  for (const d of days) run('INSERT INTO hours (weekday, start_min, end_min) VALUES (?, ?, ?)', d, from, to);
  done('/studio/hours', 'Hours added.');
}

export async function deleteHours(form: FormData): Promise<void> {
  await requireAdmin();
  run('DELETE FROM hours WHERE id = ?', int(form, 'id', 1, 1e9));
  refresh();
}

/** Blank times block whole days. */
export async function addTimeOff(form: FormData): Promise<void> {
  await requireAdmin();
  const fromDate = text(form, 'from_date', 10), toDate = text(form, 'to_date', 10) || fromDate;
  const fromTime = text(form, 'from_time', 5), toTime = text(form, 'to_time', 5);
  const start = parseLocal(fromDate, fromTime || '00:00');
  let end = parseLocal(toDate, toTime || '00:00');
  if (end !== null && !toTime) { const d = new Date(end * 1000); d.setDate(d.getDate() + 1); end = d.getTime() / 1000; }   // through the end of that day
  if (start === null || end === null || end <= start) done('/studio/hours', 'Check the time-off dates.', 'err');
  run('INSERT INTO time_off (starts_at, ends_at, note) VALUES (?, ?, ?)', start, end, text(form, 'note', 100));
  done('/studio/hours', 'Time off added — clients can’t book then.');
}

export async function deleteTimeOff(form: FormData): Promise<void> {
  await requireAdmin();
  run('DELETE FROM time_off WHERE id = ?', int(form, 'id', 1, 1e9));
  refresh();
}

export async function updateRules(form: FormData): Promise<void> {
  await requireAdmin();
  saveRules({
    booking_on: checked(form, 'booking_on') ? 1 : 0, require_paid: checked(form, 'require_paid') ? 1 : 0,
    notice_hours: int(form, 'notice_hours', 0, 720, 12), days_ahead: int(form, 'days_ahead', 1, 365, 30),
    buffer_min: int(form, 'buffer_min', 0, 240, 15), step_min: int(form, 'step_min', 5, 240, 30),
    cancel_hours: int(form, 'cancel_hours', 0, 720, 24), location: text(form, 'location', 120),
  });
  done('/studio/hours', 'Booking rules saved.');
}

export async function resetFeed(): Promise<void> {
  await requireAdmin();
  feedKey(true);
  done('/studio/hours', 'New calendar link made — the old one stopped working. Subscribe again with the new link.');
}
