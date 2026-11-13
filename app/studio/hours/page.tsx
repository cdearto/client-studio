import { requireAdmin } from '@/lib/session.ts';
import { all } from '@/lib/db.ts';
import { config } from '@/lib/config.ts';
import { getRules, feedKey, bookingOpen } from '@/lib/booking.ts';
import { when } from '@/lib/format.ts';
import { Notice, type SP } from '@/components/ui.tsx';
import { ConfirmButton } from '@/components/ConfirmButton.tsx';
import { addHours, addTimeOff, deleteHours, deleteTimeOff, resetFeed, updateRules } from './actions.ts';

export const metadata = { title: 'Hours' };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hm = (min: number) => new Date(2000, 0, 1, Math.floor(min / 60), min % 60).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export default async function Hours({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const hours = all<{ id: number; weekday: number; start_min: number; end_min: number }>('SELECT * FROM hours ORDER BY weekday, start_min');
  const timeOff = all<{ id: number; starts_at: number; ends_at: number; note: string }>('SELECT * FROM time_off WHERE ends_at > ? ORDER BY starts_at', Date.now() / 1000);
  const r = getRules();
  const feed = `${config.siteUrl}/studio/feed.ics?k=${feedKey()}`;

  return (
    <>
      <Notice searchParams={searchParams} />
      <h1 className="page">Hours &amp; booking</h1>
      <p className="muted" style={{ marginTop: '-.6rem' }}>{bookingOpen(r) ? 'Clients can book their own times from their link, inside these hours.' : 'Add weekly hours to let clients book their own times.'}</p>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2>Weekly hours</h2>
          {hours.length === 0 ? <p className="empty">No hours yet.</p> : (
            <ul className="list" style={{ marginBottom: '1rem' }}>
              {hours.map((h) => (
                <li key={h.id}><span><span className="t">{DAYS[h.weekday]}</span> <span className="s">{hm(h.start_min)} – {hm(h.end_min)}</span></span>
                  <form action={deleteHours}><input type="hidden" name="id" value={h.id} /><button className="ic" aria-label="Remove">✕</button></form></li>
              ))}
            </ul>
          )}
          <form action={addHours}>
            <div className="daypick">{DAYS.map((d, i) => <label key={d}><input type="checkbox" name="days" value={i} defaultChecked={i >= 1 && i <= 5} /><span>{d}</span></label>)}</div>
            <div className="fr">
              <label className="f"><span>From</span><input type="time" name="from" defaultValue="07:00" required /></label>
              <label className="f"><span>To</span><input type="time" name="to" defaultValue="12:00" required /></label>
            </div>
            <button className="btn ghost">Add hours</button>
          </form>
        </section>

        <section className="card">
          <h2>Time off</h2>
          {timeOff.length > 0 && (
            <ul className="list" style={{ marginBottom: '1rem' }}>
              {timeOff.map((t) => (
                <li key={t.id}><span><span className="t">{t.note || 'Time off'}</span><br /><span className="s">{when(t.starts_at)} → {when(t.ends_at)}</span></span>
                  <form action={deleteTimeOff}><input type="hidden" name="id" value={t.id} /><button className="ic" aria-label="Remove">✕</button></form></li>
              ))}
            </ul>
          )}
          <form action={addTimeOff}>
            <div className="fr">
              <label className="f"><span>From date</span><input type="date" name="from_date" required /></label>
              <label className="f"><span>To date</span><input type="date" name="to_date" /></label>
            </div>
            <div className="fr">
              <label className="f"><span>From time (blank = all day)</span><input type="time" name="from_time" /></label>
              <label className="f"><span>To time</span><input type="time" name="to_time" /></label>
            </div>
            <label className="f"><span>Note</span><input type="text" name="note" placeholder="e.g. Vacation" /></label>
            <button className="btn ghost">Add time off</button>
          </form>
        </section>
      </div>

      <section className="card">
        <h2>Booking rules</h2>
        <form action={updateRules}>
          <label className="check"><input type="checkbox" name="booking_on" defaultChecked={!!r.booking_on} /> Clients can book their own times</label>
          <label className="check"><input type="checkbox" name="require_paid" defaultChecked={!!r.require_paid} /> Only after they’ve paid (or tapped “I’ve sent it on Venmo”)</label>
          <div className="fr">
            <label className="f"><span>Notice needed (hours)</span><input type="number" name="notice_hours" min={0} max={720} defaultValue={r.notice_hours} /></label>
            <label className="f"><span>How far ahead (days)</span><input type="number" name="days_ahead" min={1} max={365} defaultValue={r.days_ahead} /></label>
            <label className="f"><span>Buffer around sessions (min)</span><input type="number" name="buffer_min" min={0} max={240} defaultValue={r.buffer_min} /></label>
            <label className="f"><span>Start times every (min)</span><input type="number" name="step_min" min={5} max={240} defaultValue={r.step_min} /></label>
            <label className="f"><span>Can cancel until (hours before)</span><input type="number" name="cancel_hours" min={0} max={720} defaultValue={r.cancel_hours} /></label>
          </div>
          <label className="f"><span>Location on booked sessions</span><input type="text" name="location" defaultValue={r.location} placeholder="e.g. Main Street studio" /></label>
          <button className="btn ghost">Save rules</button>
        </form>
      </section>

      <section className="card">
        <h2>Your calendar</h2>
        <p className="s">Subscribe once and every session — including the ones clients book — shows up in your phone’s calendar and stays updated.</p>
        <div className="btns"><a className="btn" href={feed.replace(/^https?:/, 'webcal:')}>Subscribe on this phone</a></div>
        <div className="linkbox"><input type="text" readOnly value={feed} aria-label="Calendar feed link" /></div>
        <p className="muted">Google Calendar: Settings → Add calendar → From URL. The link is private; if it was ever shared by mistake, reset it.</p>
        <form action={resetFeed}><ConfirmButton className="btn sm ghost" message="Make a new link? The old one stops working.">Reset the link</ConfirmButton></form>
      </section>
    </>
  );
}
