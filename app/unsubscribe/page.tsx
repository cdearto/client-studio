// /unsubscribe?e=…&k=… — the link in every newsletter's footer.
// Opening it only shows a button: email security scanners open every link in a
// message, and they must not unsubscribe anyone.
import type { Metadata } from 'next';
import { config } from '@/lib/config.ts';
import { normalizeEmail, validUnsubscribe } from '@/lib/newsletter.ts';
import { Invalid, UnsubscribeFlow } from './UnsubscribeFlow.tsx';
import './unsubscribe.css';

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ e?: string | string[]; k?: string | string[] }> }) {
  const q = await searchParams;
  const email = normalizeEmail(typeof q.e === 'string' ? q.e : ''), k = typeof q.k === 'string' ? q.k : '';
  return (
    <div className="unsub">
      <main>
        {validUnsubscribe(email, k)
          ? <UnsubscribeFlow email={email} k={k} businessName={config.businessName} contact={config.notifyEmail} />
          : <Invalid contact={config.notifyEmail} />}
      </main>
    </div>
  );
}
