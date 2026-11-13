// The owner's private calendar feed. Subscribed to once on a phone (Studio → Hours shows the link), it puts
// every session — including the ones clients book themselves — in that calendar, kept up to date.
// Protected by a secret key in the URL rather than the Studio login, because calendar apps can't sign in.
import { timingSafeEqual } from 'node:crypto';
import type { Session } from '@/lib/booking.ts';
import { feedKey } from '@/lib/booking.ts';
import { config } from '@/lib/config.ts';
import { all, now } from '@/lib/db.ts';
import { calendar, icsResponse, type CalEvent } from '@/lib/ics.ts';

function keyMatches(given: string): boolean {
  const a = Buffer.from(given), b = Buffer.from(feedKey());
  return a.length === b.length && timingSafeEqual(a, b);
}

type Row = Session & { title: string; package_status: string; client: string; phone: string };

export async function GET(req: Request): Promise<Response> {
  const k = new URL(req.url).searchParams.get('k') ?? '';
  if (!k || !keyMatches(k)) return new Response('Not found.', { status: 404 });

  const rows = all<Row>(`SELECT s.*, p.title, p.status AS package_status, c.name AS client, c.phone
    FROM sessions s JOIN packages p ON p.id = s.package_id JOIN clients c ON c.id = p.client_id
    WHERE s.status IN ('scheduled', 'done') AND p.status <> 'cancelled' AND s.starts_at > ?
    ORDER BY s.starts_at`, now() - 60 * 86400);

  const events = rows.map((s): CalEvent => ({
    uid: `session-${s.id}@${config.siteHost}`,
    start: s.starts_at,
    minutes: s.minutes,
    summary: `${s.client} — ${s.title}${s.package_status === 'paid' ? '' : ' (unpaid)'}`,
    location: s.location,
    description: (s.booked_by_client ? 'Booked by client. ' : '') + (s.phone ? `${s.phone} · ` : '')
      + `${config.siteUrl}/studio/packages/${s.package_id}`,
  }));
  return icsResponse(calendar(`${config.businessName} Sessions`, events, { refreshMinutes: 15 }));
}
