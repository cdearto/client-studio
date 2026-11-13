import Link from 'next/link';
import { requireAdmin } from '@/lib/session.ts';
import { clientsWithCurrent, left } from '@/lib/studio.ts';
import { e164 } from '@/lib/booking.ts';
import { greetName, startOfToday } from '@/lib/format.ts';
import { TextComposer, type Recipient } from './TextComposer.tsx';

export const metadata = { title: 'Text clients' };

export default async function Texts() {
  await requireAdmin();
  const weekEnd = startOfToday() + 7 * 86400;
  const recipients: Recipient[] = clientsWithCurrent().filter((c) => e164(c.phone)).map((c) => ({
    id: c.id, name: c.name, first: greetName(c.name), phone: e164(c.phone),
    tags: [
      c.next_at && c.next_at < weekEnd ? 'week' : '',
      c.package_id && left(c) > 0 ? 'active' : '',
      c.package_id && left(c) <= 1 ? 'renew' : '',
      c.status === 'sent' || c.status === 'draft' ? 'unpaid' : '',
    ].filter(Boolean),
  }));
  return (
    <>
      <p style={{ margin: '0 0 .5rem' }}><Link className="muted" href="/studio/clients">← Clients</Link></p>
      <h1 className="page">Text clients</h1>
      {recipients.length === 0 ? <p className="empty">No clients with a mobile number yet.</p> : <TextComposer recipients={recipients} />}
    </>
  );
}
