import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session.ts';
import { one } from '@/lib/db.ts';
import { config } from '@/lib/config.ts';
import { getPackage, getSessions, leftToBook, usedCount, payUrl, paymentRef, smsBody, smsLink, bookingOpen } from '@/lib/booking.ts';
import { money, plural, when, dayKey } from '@/lib/format.ts';
import { Chip, Meter, Notice, StatusChip, type SP } from '@/components/ui.tsx';
import { emailPackage, logSession, notReceived, setPackageStatus, setPaid, setSessionStatus } from '../actions.ts';
import { SendButtons } from './SendButtons.tsx';
import { ConfirmButton } from '@/components/ConfirmButton.tsx';

export const metadata = { title: 'Package' };

const Hidden = ({ id, back }: { id: number; back: string }) => (<><input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} /></>);

export default async function PackagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await requireAdmin();
  const p = getPackage(Number((await params).id));
  if (!p) notFound();
  const sessions = getSessions(p.id);
  const used = usedCount(p.id);
  const here = `/studio/packages/${p.id}`;
  const newer = one<{ id: number }>("SELECT id FROM packages WHERE client_id = ? AND id <> ? AND status <> 'cancelled' AND created_at > ? ORDER BY created_at DESC LIMIT 1", p.client_id, p.id, p.created_at);
  const nowSec = Date.now() / 1000;

  return (
    <>
      <Notice searchParams={searchParams} />
      <p style={{ margin: '0 0 .5rem' }}><Link className="muted" href={`/studio/clients/${p.client_id}`}>← {p.client_name}</Link></p>
      <div className="top" style={{ marginBottom: '1rem' }}>
        <h1 className="page" style={{ margin: 0 }}>{p.title} <StatusChip status={p.status} claimed={p.venmo_rejected_at ? null : p.venmo_claimed_at} /></h1>
        <Link className="btn sm ghost" href={`${here}/edit`}>Edit</Link>
      </div>
      {newer && <div className="setup">This is an older package. <Link href={`/studio/packages/${newer.id}`}>Go to their current one →</Link></div>}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="card cur">
          <h2>Sessions</h2>
          <div className="big">{plural(p.session_count, 'session')} · {money(p.price_cents)}</div>
          <Meter used={used} count={p.session_count} />
          {sessions.length === 0 ? (
            <p className="empty">No dates yet. <Link href={`${here}/edit#dates`}>Schedule sessions →</Link>{bookingOpen() ? ' or let them book from their link.' : ''}</p>
          ) : (
            <ul className="list" style={{ marginTop: '.8rem' }}>
              {sessions.map((s) => (
                <li key={s.id} style={s.status === 'cancelled' ? { opacity: 0.5 } : undefined}>
                  <span><span className="t">{when(s.starts_at)}</span><br />
                    <span className="s">{s.minutes} min{s.location ? ` · ${s.location}` : ''} {s.booked_by_client ? <Chip kind="">self-booked</Chip> : null} {s.status !== 'scheduled' && <Chip kind={s.status}>{s.status}</Chip>}</span></span>
                  <form action={setSessionStatus} className="btns">
                    <input type="hidden" name="session_id" value={s.id} /><input type="hidden" name="back" value={here} />
                    {s.status === 'scheduled' && s.starts_at < nowSec + 86400 && <button className="btn sm" name="status" value="done">Done ✓</button>}
                    {s.status === 'scheduled' && <button className="btn sm ghost" name="status" value="cancelled">Cancel</button>}
                    {s.status !== 'scheduled' && <button className="btn sm ghost" name="status" value="scheduled">Undo</button>}
                  </form>
                </li>
              ))}
            </ul>
          )}
          {p.status !== 'cancelled' && used < p.session_count && (
            <form action={logSession} className="logform" style={{ marginTop: '1rem' }}>
              <input type="hidden" name="package_id" value={p.id} /><input type="hidden" name="back" value={here} />
              <input type="date" name="date" defaultValue={dayKey(new Date())} aria-label="Date" required />
              <input type="time" name="time" aria-label="Time (optional)" />
              <button className="btn sm ghost">Log a session</button>
            </form>
          )}
          {used >= p.session_count && <Link className="btn block" style={{ marginTop: '1rem' }} href={`/studio/packages/new?from=${p.id}`}>Package used up — renew →</Link>}
          <p className="muted" style={{ marginTop: '.8rem' }}>{leftToBook(p)} left to book.</p>
        </section>

        <div>
          {p.status !== 'cancelled' && (
            <section className="card">
              <h2>Send to {p.client_name.split(' ')[0]}</h2>
              <SendButtons id={p.id} smsHref={smsLink(p.client_phone, smsBody(p))} link={payUrl(p)} hasPhone={p.client_phone.replace(/\D/g, '').length >= 10} />
              <form action={emailPackage} style={{ marginTop: '.6rem' }}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn ghost block" disabled={!p.client_email}>{p.client_email ? `Email it to ${p.client_email}` : 'Email it (no email on file)'}</button>
              </form>
              <p className="muted" style={{ marginTop: '.8rem' }}>
                {p.sent_at ? `Sent ${when(p.sent_at)}` : 'Not sent yet'}{p.viewed_at ? ` · opened ${when(p.viewed_at)}` : p.sent_at ? ' · not opened yet' : ''}
              </p>
            </section>
          )}

          <section className="card">
            <h2>Payment</h2>
            <dl className="kv">
              <dt>Price</dt><dd>{money(p.price_cents)}</dd>
              <dt>Status</dt><dd>{p.status === 'paid' ? `Paid ${when(p.paid_at!)}` : p.status === 'cancelled' ? 'Withdrawn' : 'Not paid yet'}</dd>
              {config.venmo && <><dt>Venmo note code</dt><dd>{paymentRef(p)}</dd></>}
              {p.venmo_claimed_at && p.status !== 'paid' && <><dt>Client says</dt><dd>Sent on Venmo {when(p.venmo_claimed_at)}{p.venmo_rejected_at ? ' · marked not received' : ''}</dd></>}
            </dl>
            <div className="btns" style={{ marginTop: '1rem' }}>
              {p.status !== 'paid' && p.status !== 'cancelled' && <form action={setPaid}><Hidden id={p.id} back={here} /><button className="btn sm">Mark paid</button></form>}
              {p.venmo_claimed_at && !p.venmo_rejected_at && p.status !== 'paid' && <form action={notReceived}><input type="hidden" name="id" value={p.id} /><button className="btn sm ghost">Not received</button></form>}
              {p.status === 'paid' && <form action={setPaid}><Hidden id={p.id} back={here} /><input type="hidden" name="undo" value="1" /><button className="btn sm ghost">Undo paid</button></form>}
            </div>
          </section>

          <section className="card">
            <h2>More</h2>
            <div className="btns">
              <Link className="btn sm ghost" href={`/studio/packages/new?from=${p.id}`}>Renew package</Link>
              <form action={setPackageStatus}><input type="hidden" name="id" value={p.id} />
                {p.status === 'cancelled'
                  ? <button className="btn sm ghost" name="to" value="reopen">Reopen</button>
                  : <ConfirmButton className="btn sm danger" name="to" value="withdraw" message="Withdraw this package? Upcoming sessions are cancelled and the link shows it as closed.">Withdraw</ConfirmButton>}
              </form>
              {p.status !== 'paid' && (
                <form action={setPackageStatus}><input type="hidden" name="id" value={p.id} /><ConfirmButton className="btn sm danger" name="to" value="delete" message="Delete this package and its sessions for good?">Delete</ConfirmButton></form>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
