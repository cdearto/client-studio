import Link from 'next/link';
import { requireAdmin } from '@/lib/session.ts';
import { scheduleData, left } from '@/lib/studio.ts';
import { bookingOpen, paymentRef } from '@/lib/booking.ts';
import { money, plural, shortDate, timeOf, longDay, dayKey, when } from '@/lib/format.ts';
import { Chip, Notice, StatusChip, type SP } from '@/components/ui.tsx';
import { notReceived, setPaid, setSessionStatus } from './packages/actions.ts';

export const metadata = { title: 'Schedule' };

export default async function Schedule({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const d = scheduleData();
  const byDay = Map.groupBy(d.upcoming, (s) => dayKey(new Date(s.starts_at * 1000)));

  return (
    <>
      <Notice searchParams={searchParams} />
      {!bookingOpen() && (
        <div className="setup">Clients can’t book their own times yet. <Link href="/studio/hours">Set up your hours →</Link></div>
      )}
      <div className="btns" style={{ marginBottom: '1.2rem' }}>
        <Link className="btn" href="/studio/clients/new">+ New client</Link>
        <Link className="btn ghost" href="/studio/packages/new">+ New package</Link>
        <Link className="btn ghost" href="/studio/texts">Text clients</Link>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="n">{d.sessionsThisWeek}</div><div className="l">Sessions next 7 days</div></div>
        <div className="kpi"><div className="n">{money(d.owed)}</div><div className="l">Awaiting payment ({d.owedCount})</div></div>
        <div className="kpi"><div className="n">{money(d.paidThisMonth)}</div><div className="l">Paid in {new Date().toLocaleString('en-US', { month: 'long' })}</div></div>
      </div>

      {d.venmoToConfirm.length > 0 && (
        <section className="card" style={{ borderColor: '#5a4d2f' }}>
          <h2>Venmo to confirm</h2>
          <p className="muted" style={{ marginTop: '-.4rem' }}>They say they’ve paid — check your Venmo for the amount and note code, then confirm.</p>
          <ul className="list">
            {d.venmoToConfirm.map((p) => (
              <li key={p.id}>
                <Link className="row" href={`/studio/packages/${p.id}`}>
                  <span><span className="t">{p.client} · {money(p.price_cents)}</span><br /><span className="s">Note {paymentRef(p)} · sent {when(p.venmo_claimed_at!)}</span></span>
                </Link>
                <span className="btns">
                  <form action={setPaid}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value="/studio" /><button className="btn sm">Got it ✓</button></form>
                  <form action={notReceived}><input type="hidden" name="id" value={p.id} /><button className="btn sm ghost">Not received</button></form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.renew.length > 0 && (
        <section className="card" style={{ borderColor: '#5a2f2f' }}>
          <h2>Time to renew</h2>
          <ul className="list">
            {d.renew.map((c) => (
              <li key={c.id}>
                <Link className="row" href={`/studio/clients/${c.id}`}>
                  <span><span className="t">{c.name}</span><br />
                    <span className="s">{c.title} · <strong>{left(c) ? '1 session left' : `all ${c.session_count} used`}</strong>{c.last_at ? ` · last ${shortDate(c.last_at)}` : ''}</span></span>
                </Link>
                <Link className={`btn sm ${left(c) ? 'ghost' : ''}`} href={`/studio/packages/new?from=${c.package_id}`}>Renew</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.drafts.length > 0 && (
        <section className="card">
          <h2>Not sent yet</h2>
          <ul className="list">
            {d.drafts.map((p) => (
              <li key={p.id}><Link className="row" href={`/studio/packages/${p.id}`}><span><span className="t">{p.client}</span><br /><span className="s">{p.title}</span></span><span className="btn sm">Send →</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      {d.toMark.length > 0 && (
        <section className="card">
          <h2>Did these happen?</h2>
          <ul className="list">
            {d.toMark.map((s) => (
              <li key={s.id}>
                <Link className="row" href={`/studio/packages/${s.package_id}`}><span><span className="t">{s.client}</span><br /><span className="s">{when(s.starts_at)} · {s.title}</span></span></Link>
                <span className="btns">
                  {(['done', 'cancelled'] as const).map((status) => (
                    <form key={status} action={setSessionStatus}>
                      <input type="hidden" name="session_id" value={s.id} /><input type="hidden" name="status" value={status} /><input type="hidden" name="back" value="/studio" />
                      <button className={`btn sm ${status === 'done' ? '' : 'ghost'}`}>{status === 'done' ? 'Done ✓' : 'Didn’t happen'}</button>
                    </form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Upcoming</h2>
        {d.upcoming.length === 0 ? <p className="empty">Nothing scheduled yet.</p> : [...byDay].map(([day, sessions]) => (
          <div key={day}>
            <div className="day">{longDay(sessions[0].starts_at)}</div>
            <ul className="list">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link className="row" href={`/studio/packages/${s.package_id}`}>
                    <span><span className="t">{timeOf(s.starts_at)} · {s.client}</span><br />
                      <span className="s">{s.title} · {s.minutes} min{s.location ? ` · ${s.location}` : ''}</span></span>
                    <span className="r">{s.booked_by_client ? <Chip kind="">self-booked</Chip> : null} {s.package_status !== 'paid' && <StatusChip status={s.package_status} />}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {d.unscheduled.length > 0 && (
        <section className="card">
          <h2>Nothing booked</h2>
          <ul className="list">
            {d.unscheduled.map((c) => (
              <li key={c.id}>
                <Link className="row" href={`/studio/clients/${c.id}`}><span><span className="t">{c.name}</span><br />
                  <span className="s">{c.package_id ? `${c.title} · ${plural(left(c), 'session')} left` : 'No package yet'}</span></span></Link>
                {c.package_id
                  ? <Link className="btn sm" href={`/studio/packages/${c.package_id}/edit#dates`}>Schedule</Link>
                  : <Link className="btn sm ghost" href={`/studio/packages/new?client=${c.id}`}>New package</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p><Link className="muted" href="/studio/clients">All clients ({d.clientCount}) →</Link></p>
    </>
  );
}
