// .ics download of a package's sessions, so the client can add them to Apple / Google / Outlook calendars.
import { getPackageByToken, getSessions, payUrl } from '@/lib/booking.ts';
import { config } from '@/lib/config.ts';
import { calendar, icsResponse } from '@/lib/ics.ts';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const p = getPackageByToken((await params).token);
  if (!p || p.status === 'cancelled') return new Response('Not found.', { status: 404 });
  const events = getSessions(p.id).filter((s) => s.status !== 'cancelled').map((s) => ({
    uid: `session-${s.id}@${config.siteHost}`,
    start: s.starts_at,
    minutes: s.minutes,
    summary: `${config.businessName} — ${p.title}`,
    location: s.location,
    description: `Session with ${config.ownerName}. Details: ${payUrl(p)}`,
    alarmMinutes: 120,
  }));
  return icsResponse(calendar(config.businessName, events), 'sessions.ics');
}
