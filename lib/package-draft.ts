// Builds the PackageForm's starting values for new, renew and edit.
import { getPackage, getSessions } from './booking.ts';
import { dollarsInput, dayKey } from './format.ts';

export type PackageDraft = {
  id: number; client_id: number; title: string; description: string; note: string;
  session_count: number; session_minutes: number; price: string; paid: boolean;
  sessions: { id: number; date: string; time: string }[];
};

const toRow = (s: { id: number; starts_at: number }) => {
  const d = new Date(s.starts_at * 1000);
  return { id: s.id, date: dayKey(d), time: d.toTimeString().slice(0, 5) };
};

export function draftFor({ editId, renewFrom, clientId }: { editId?: number; renewFrom?: number; clientId?: number }): PackageDraft | null {
  const blank: PackageDraft = { id: 0, client_id: clientId ?? 0, title: '', description: '', note: '', session_count: 5, session_minutes: 60, price: '', paid: false, sessions: [] };
  const source = editId ?? renewFrom;
  if (!source) return blank;
  const p = getPackage(source);
  if (!p) return editId ? null : blank;
  const base = { ...blank, client_id: p.client_id, title: p.title, description: p.description, session_count: p.session_count, session_minutes: p.session_minutes, price: dollarsInput(p.price_cents) };
  // Renewing starts a fresh package at their last price; editing keeps everything.
  return editId
    ? { ...base, id: p.id, note: p.note, paid: p.status === 'paid', sessions: getSessions(p.id).filter((s) => s.status === 'scheduled').map(toRow) }
    : base;
}
