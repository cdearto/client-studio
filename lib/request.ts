/**
 * The visitor's IP. Each reverse proxy in front of the app appends the address
 * it received the request from, so with N proxies the visitor is N entries from
 * the end; anything further left was sent by the client and is ignored.
 * (Next.js only fills the header in when it's missing, so with no proxy at all
 * it can't be trusted. Every real host has at least one, hence the default of 1.)
 */
import { config } from './config.ts';

export function clientIp(headers: Headers, trustedProxies = config.trustedProxies): string {
  const chain = (headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return chain[Math.max(0, chain.length - Math.max(1, trustedProxies))] ?? '';
}
