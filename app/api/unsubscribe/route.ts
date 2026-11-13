// The URL in each newsletter's List-Unsubscribe header.
// POST: RFC 8058 one-click — Gmail / Apple Mail post "List-Unsubscribe=One-Click"
// here when someone taps their built-in Unsubscribe; the signed link is the proof.
// GET: mail apps without one-click open the URL in a browser, so send them to the
// confirm page (a GET must never unsubscribe: link scanners open every URL).
import { config } from '@/lib/config.ts';
import { normalizeEmail, unsubscribe, validUnsubscribe } from '@/lib/newsletter.ts';

const plain = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

const link = (req: Request) => {
  const q = new URL(req.url).searchParams;
  return { email: normalizeEmail(q.get('e')), key: q.get('k') ?? '' };
};

export async function POST(req: Request) {
  const { email, key } = link(req);
  if (!validUnsubscribe(email, key)) return plain('Invalid unsubscribe link.', 400);
  unsubscribe(email);
  return plain('Unsubscribed.', 200);
}

export async function GET(req: Request) {
  const { email, key } = link(req);
  return Response.redirect(`${config.siteUrl}/unsubscribe?${new URLSearchParams({ e: email, k: key })}`, 303);
}
