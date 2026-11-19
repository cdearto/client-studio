// GET /studio/analytics.csv?range=30: the daily numbers behind the Analytics chart.
import { cookies } from 'next/headers';
import { SESSION_COOKIE, isValidSessionToken } from '@/lib/auth.ts';
import { daily, periods, toRange } from '@/lib/analytics.ts';
import { csvRow } from '@/lib/csv.ts';

export async function GET(request: Request) {
  if (!isValidSessionToken((await cookies()).get(SESSION_COOKIE)?.value)) {
    return new Response('Sign in to Studio first.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const { current } = periods(toRange(new URL(request.url).searchParams.get('range')));
  const lines = [csvRow(['day', 'visitors', 'pageviews', 'events']),
    ...daily(current.from, current.to).map((d) => csvRow([d.day, d.visitors, d.pageviews, d.events]))];
  return new Response(`${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="analytics-${current.from}-to-${current.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
