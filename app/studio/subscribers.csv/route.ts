// GET /studio/subscribers.csv: everyone still on the list, for a spreadsheet or another mail tool.
import { cookies } from 'next/headers';
import { SESSION_COOKIE, isValidSessionToken } from '@/lib/auth.ts';
import { csvRow } from '@/lib/csv.ts';
import { all } from '@/lib/db.ts';
import { dayKey } from '@/lib/format.ts';
import type { Subscriber } from '@/lib/newsletter.ts';

const stamp = (ts: number) => { const d = new Date(ts * 1000); return `${dayKey(d)} ${d.toTimeString().slice(0, 5)}`; };

export async function GET() {
  if (!isValidSessionToken((await cookies()).get(SESSION_COOKIE)?.value)) {
    return new Response('Sign in to Studio first.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const rows = all<Subscriber>('SELECT email, name, source, subscribed_at FROM subscribers WHERE unsubscribed_at IS NULL ORDER BY subscribed_at');
  const lines = [csvRow(['email', 'name', 'source', 'subscribed_at']), ...rows.map((r) => csvRow([r.email, r.name, r.source, stamp(r.subscribed_at)]))];
  // The BOM makes Excel read the file as UTF-8 (names with accents).
  return new Response(`﻿${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="subscribers-${dayKey(new Date())}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
