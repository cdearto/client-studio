// The client's private page (/pay/TOKEN), texted or emailed by the owner: their package,
// a personal note, a Pay with Venmo button, their sessions, and a picker to book times.
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  bookingBlock, bookingOpen, canCancel, getPackageByToken, getRules, getSessions, leftToBook,
  paymentRef, slots, usedCount, venmoUrl, type Package,
} from '@/lib/booking.ts';
import { config } from '@/lib/config.ts';
import { now, run } from '@/lib/db.ts';
import { firstName, longDay, money, parseLocal, plural, shortDate, timeOf, when } from '@/lib/format.ts';
import { book, cancel, claim } from './actions.ts';
import { ConfirmForm } from './ConfirmForm.tsx';
import '../pay.css';

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = getPackageByToken((await params).token);
  return {
    title: p ? p.title : 'Link not found',
    robots: { index: false, follow: false },
    openGraph: p ? { title: `Your sessions with ${config.businessName}`, description: `${p.title} — ${plural(p.session_count, 'session')}` } : undefined,
  };
}

const BOT = /bot|crawl|spider|preview|facebookexternalhit|slack|whatsapp|discord|curl|wget|headless/i;
const isBot = (ua: string) => ua.trim() === '' || BOT.test(ua);

const fmt = (ts: number, opts: Intl.DateTimeFormatOptions) => new Date(ts * 1000).toLocaleString('en-US', opts);
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');   // ?day=a&day=b arrives as an array

function messages(owner: string, cancelHours: number): Record<string, ['ok' | 'err', string]> {
  return {
    booked: ['ok', 'You’re booked ✓ See you then.'],
    cancelled: ['ok', 'Cancelled — that session is back in your package to rebook.'],
    taken: ['err', 'That time was just taken. Pick another.'],
    late: ['err', `That session is less than ${cancelHours} hours away — text ${owner} to change it.`],
    full: ['err', 'All the sessions in your package are booked.'],
    unpaid: ['err', 'Booking opens once you’ve paid.'],
    closed: ['err', `Online booking is closed right now — text ${owner} to book.`],
    gone: ['err', 'That session was already changed.'],
    error: ['err', `Something went wrong — try again, or text ${owner}.`],
    busy: ['err', `That’s a lot of changes for one day — text ${owner} to sort it out.`],
  };
}

function Mail() {
  return <a href={`mailto:${config.notifyEmail}`}>{config.notifyEmail}</a>;
}

/** Venmo button, the amount/handle/ref as plain text, and "I've sent it". */
function PayOptions({ p }: { p: Package }) {
  return (
    <>
      <a className="btn" href={venmoUrl(p)}>Pay {money(p.price_cents)} with Venmo</a>
      <p className="secure">
        To <strong>@{config.venmo}</strong> · keep <strong>{paymentRef(p)}</strong> in the note so {config.ownerName} can match it
      </p>
      <form action={claim} className="sent">
        <input type="hidden" name="t" value={p.token} />
        <button className="btn btn--ghost" type="submit">I’ve Sent It on Venmo</button>
      </form>
    </>
  );
}

export default async function PayPage({ params, searchParams }: Props) {
  const { token } = await params;
  const p = getPackageByToken(token);
  if (!p) notFound();
  const sp = await searchParams;

  // First real open → "viewed" (skip iMessage/Slack link-preview fetchers).
  if (p.viewed_at === null && !isBot((await headers()).get('user-agent') ?? '')) {
    run('UPDATE packages SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL', now(), p.id);
  }

  const owner = config.ownerName;
  if (p.status === 'cancelled') {
    return (
      <div className="pay"><main>
        <span className="wordmark">{config.businessName}</span>
        <p className="kicker">No longer active</p>
        <h1>This One’s Closed.</h1>
        <div className="card"><p style={{ margin: 0 }}>This offer has been withdrawn. If that’s a surprise, reach out at <Mail />.</p></div>
      </main></div>
    );
  }

  const rules = getRules();
  const sessions = getSessions(p.id).filter((s) => s.status !== 'cancelled');
  const used = usedCount(p.id);
  const first = firstName(p.client_name);
  const paid = p.status === 'paid';
  const block = bookingBlock(p, rules);
  const toBook = leftToBook(p);
  const minutes = Math.max(15, p.session_minutes || 60);   // same length clientBook() books
  const open = block === '' ? slots(minutes, undefined, rules) : {};
  const days = Object.keys(open);
  const day = one(sp.day) in open ? one(sp.day) : (days[0] ?? '');
  const msg = messages(owner, rules.cancel_hours)[one(sp.msg)];
  const cancelOpen = bookingOpen(rules);
  const rendered = Date.now();   // re-keys the confirm forms, so one that survives an action isn't left disabled

  return (
    <div className="pay"><main>
      <span className="wordmark">{config.businessName}</span>
      <p className="kicker">{paid ? 'Confirmed' : `For ${first}`}</p>
      <h1>{paid ? 'See You Soon.' : 'Your Sessions.'}</h1>

      {paid ? (
        <div className="card paid">
          <span className="mark">Paid ✓</span>
          <p style={{ margin: 0 }}>
            Thanks, {first} — your payment of {money(p.price_cents)} went through{p.paid_at ? ` on ${shortDate(p.paid_at)}` : ''}.
            {block === '' ? ' Pick your times below.' : ''}
          </p>
        </div>
      ) : p.note.trim() !== '' && (
        <div className="card note">{p.note.trim()}<span className="sig">— {owner}</span></div>
      )}

      <div className="card">
        <div className="pkg">
          <div>
            <h2>{p.title}</h2>
            <div className="sub">
              {plural(p.session_count, 'session')} with {owner}{used ? ` · ${Math.max(0, p.session_count - used)} left` : ''}
            </div>
          </div>
          <div className="price">{money(p.price_cents)}</div>
        </div>
        {p.description.trim() !== '' && <p className="desc">{p.description.trim()}</p>}
      </div>

      {paid || p.price_cents <= 0 ? null : config.venmo === '' ? (
        <div className="card"><p style={{ margin: 0 }}>Reply to {owner}’s message or email <Mail /> to settle up.</p></div>
      ) : p.venmo_claimed_at ? (
        <div className="card paid">
          <span className="mark">Venmo sent</span>
          <p style={{ margin: 0 }}>
            Thanks, {first}. {owner} will confirm your {money(p.price_cents)} as soon as it lands — this page will flip to paid.
          </p>
          <details className="again"><summary>Didn’t go through? Pay again</summary><PayOptions p={p} /></details>
        </div>
      ) : (
        <div className="paybox"><PayOptions p={p} /></div>
      )}

      <div className="card" id="book">
        <h3>Your sessions</h3>
        {msg && <div className={`msg ${msg[0]}`} role={msg[0] === 'err' ? 'alert' : 'status'}>{msg[1]}</div>}
        {sessions.length > 0 && (
          <ul className="sess">
            {sessions.map((s) => (
              <li key={s.id} className={s.status === 'done' ? 'past' : undefined}>
                <span>
                  <span className="d">{when(s.starts_at)}</span><br />
                  <span className="m">{s.status === 'done' ? 'Done ✓ · ' : ''}{s.minutes} min{s.location ? ` · ${s.location}` : ''}</span>
                </span>
                {cancelOpen && canCancel(s, rules) && (
                  <ConfirmForm key={`${s.id}-${rendered}`} action={cancel} className="link" label="Cancel" confirm={`Cancel ${when(s.starts_at)}?`}>
                    <input type="hidden" name="t" value={p.token} />
                    <input type="hidden" name="sid" value={s.id} />
                  </ConfirmForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {toBook > 0 ? (
          <p className="tbd" style={{ margin: `${sessions.length ? '.9rem' : '0'} 0 0` }}>
            {plural(toBook, 'session')} left to book.{' '}
            {block === 'closed' ? 'We’ll lock in dates together.'
              : block === 'unpaid' ? `Booking opens once you’ve paid${p.venmo_rejected_at ? ` and ${owner} has confirmed it.`
                : config.venmo ? ' — tap “I’ve Sent It on Venmo” after paying.' : '.'}`
              : ''}
          </p>
        ) : sessions.length > 0 && (
          <p className="tbd" style={{ margin: '.9rem 0 0' }}>All your sessions are booked.</p>
        )}

        {block === '' && (
          <>
            <h3 style={{ marginTop: '1.4rem' }}>Book a time</h3>
            {days.length === 0 ? (
              <p className="tbd" style={{ margin: 0 }}>No open times in the next {rules.days_ahead} days — text {owner} and they’ll fit you in.</p>
            ) : (
              <>
                <nav className="days" aria-label="Days with open times">
                  {days.map((d) => {
                    const ts = parseLocal(d) ?? 0;
                    return (
                      <Link key={d} className={d === day ? 'on' : undefined} href={`/pay/${p.token}?day=${d}#book`}
                        aria-current={d === day ? 'date' : undefined} replace>
                        <span>{fmt(ts, { weekday: 'short' })}</span><strong>{fmt(ts, { day: 'numeric' })}</strong><span>{fmt(ts, { month: 'short' })}</span>
                      </Link>
                    );
                  })}
                </nav>
                <p className="tbd" style={{ margin: '.9rem 0 .6rem' }}>{longDay(parseLocal(day) ?? 0)} · {minutes} min</p>
                <div className="times">
                  {open[day].map((ts) => (
                    <ConfirmForm key={`${ts}-${rendered}`} action={book} label={timeOf(ts)} confirm={`Book ${when(ts)}?`}>
                      <input type="hidden" name="t" value={p.token} />
                      <input type="hidden" name="ts" value={ts} />
                    </ConfirmForm>
                  ))}
                </div>
                {rules.cancel_hours > 0 && <p className="secure" style={{ marginTop: '1rem' }}>You can cancel up to {rules.cancel_hours} hours before.</p>}
              </>
            )}
          </>
        )}
      </div>

      {sessions.some((s) => s.status === 'scheduled') && (
        <a className="btn btn--ghost" href={`/pay/${p.token}/calendar.ics`}>Add to Calendar</a>
      )}

      <p className="foot">Questions? <Mail /></p>
    </main></div>
  );
}
