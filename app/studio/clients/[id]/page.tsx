import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session.ts';
import { clientsWithCurrent, packagesForClient, left } from '@/lib/studio.ts';
import { e164, smsLink } from '@/lib/booking.ts';
import { money, shortDate, when, dayKey } from '@/lib/format.ts';
import { Meter, Notice, StatusChip, type SP } from '@/components/ui.tsx';
import { ClientFields } from '@/components/ClientFields.tsx';
import { saveClient } from '../actions.ts';
import { logSession } from '../../packages/actions.ts';

export const metadata = { title: 'Client' };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await requireAdmin();
  const [c] = clientsWithCurrent(Number((await params).id));
  if (!c) notFound();
  const history = packagesForClient(c.id);
  const here = `/studio/clients/${c.id}`;
  const remaining = left(c);

  return (
    <>
      <Notice searchParams={searchParams} />
      <p style={{ margin: '0 0 .5rem' }}><Link className="muted" href="/studio/clients">← Clients</Link></p>
      <h1 className="page">{c.name}</h1>
      <div className="btns" style={{ marginBottom: '1rem' }}>
        {e164(c.phone) && <><a className="btn sm ghost" href={`tel:${e164(c.phone)}`}>Call</a><a className="btn sm ghost" href={smsLink(c.phone, '')}>Text</a></>}
        {c.email && <a className="btn sm ghost" href={`mailto:${c.email}`}>Email</a>}
      </div>

      <section className="card cur">
        <h2>Current package</h2>
        {!c.package_id ? (
          <div className="btns"><Link className="btn" href={`/studio/packages/new?client=${c.id}`}>Set up their package →</Link></div>
        ) : (
          <>
            <div className="big">{c.title}</div>
            <Meter used={c.used} count={c.session_count} />
            <p className="s" style={{ margin: '.3rem 0 1rem' }}>
              {money(c.price_cents)} {c.status && c.status !== 'paid' && <StatusChip status={c.status} claimed={c.venmo_claimed_at} />}
              {c.next_at ? ` · next ${when(c.next_at)}` : ''}{c.last_at ? ` · last ${shortDate(c.last_at)}` : ''}
            </p>
            <div className="btns">
              <Link className={`btn sm ${remaining <= 1 ? '' : 'ghost'}`} href={`/studio/packages/new?from=${c.package_id}`}>{remaining === 0 ? 'Renew package →' : 'Renew early'}</Link>
              <Link className="btn sm ghost" href={`/studio/packages/${c.package_id}`}>Sessions, send &amp; payment</Link>
            </div>
            {remaining > 0 && (
              <form action={logSession} className="logform" style={{ marginTop: '1rem' }}>
                <input type="hidden" name="package_id" value={c.package_id} /><input type="hidden" name="back" value={here} />
                <input type="date" name="date" defaultValue={dayKey(new Date())} aria-label="Date" required />
                <button className="btn sm ghost">Log a session</button>
              </form>
            )}
          </>
        )}
      </section>

      <section className="card" id="history">
        <h2>History</h2>
        {history.length === 0 ? <p className="empty">No packages yet.</p> : (
          <ul className="list">
            {history.map((p) => (
              <li key={p.id}>
                <Link className="row" href={`/studio/packages/${p.id}`}>
                  <span><span className="t">{p.title}</span><br /><span className="s">{shortDate(p.created_at)} · {p.used} of {p.session_count} used · {money(p.price_cents)}</span></span>
                  <span className="r"><StatusChip status={p.status} claimed={p.venmo_rejected_at ? null : p.venmo_claimed_at} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <details className="edit">
          <summary>Edit contact &amp; notes</summary>
          <form action={saveClient}><input type="hidden" name="id" value={c.id} /><ClientFields c={c} /><button className="btn ghost">Save</button></form>
        </details>
        {!!c.notes && <p className="s" style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>{c.notes}</p>}
      </section>
    </>
  );
}
