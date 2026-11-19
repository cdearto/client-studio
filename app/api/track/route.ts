// Ingestion endpoint for the website tracker. Always answers 204 quickly; never errors to the visitor.
import { overLimit } from '@/lib/db.ts';
import { dayKey } from '@/lib/format.ts';
import { clientIp } from '@/lib/request.ts';
import { geoFromHeaders, insertHit, isBot, parseUserAgent, pruneOldHits, redactPrivate, trafficSource, visitorId } from '@/lib/tracking.ts';

const noContent = () => new Response(null, { status: 204 });
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function POST(request: Request): Promise<Response> {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 4096) return noContent();
    const ip = clientIp(request.headers);
    if (overLimit('track', ip, 120, 60)) return noContent();   // 120 hits a minute per address; a flood is dropped

    const body = JSON.parse(await request.text()) as Record<string, unknown>;
    const path = redactPrivate(text(body.path, 300) || '/');
    // The owner's own Studio screens aren't website traffic (the tracker's click
    // listener outlives a client-side navigation from the home page into Studio).
    if (path === '/studio' || path.startsWith('/studio/')) return noContent();

    const ua = request.headers.get('user-agent') ?? '';
    const bot = isBot(ua);
    const now = new Date();
    const day = dayKey(now);
    const referrer = redactPrivate(text(body.ref, 300));
    insertHit({
      ts: Math.floor(now.getTime() / 1000), day,
      type: body.type === 'event' ? 'event' : 'pageview',
      name: text(body.name, 60), path, referrer,
      source: trafficSource(referrer, text(body.utm, 60), request.headers.get('host') ?? ''),
      visitor: visitorId(ip, ua, day),
      ...parseUserAgent(ua),
      ...(bot ? { country: '', region: '', city: '' } : geoFromHeaders(request.headers)),
      isBot: bot,
    });
    if (Math.random() < 0.002) pruneOldHits();
  } catch {
    // Malformed beacons are ignored.
  }
  return noContent();
}
