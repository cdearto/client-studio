import Link from 'next/link';
import { Chip, Notice, type SP } from '@/components/ui.tsx';
import { config } from '@/lib/config.ts';
import { scalar } from '@/lib/db.ts';
import { plural, shortDate, timeOf } from '@/lib/format.ts';
import { activeCount, listNewsletters, listSubscribers, mailingAddress } from '@/lib/newsletter.ts';
import { requireAdmin } from '@/lib/session.ts';
import { addSubscriber, deleteDraft, duplicate, removeSubscriber, saveMailingAddress } from './actions.ts';
import { ConfirmButton } from '@/components/ConfirmButton.tsx';

export const metadata = { title: 'Newsletter' };

const year = (ts: number) => new Date(ts * 1000).getFullYear();

export default async function NewsletterPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const address = mailingAddress();
  const active = activeCount();
  const unsubscribed = scalar('SELECT COUNT(*) FROM subscribers WHERE unsubscribed_at IS NOT NULL');
  const letters = listNewsletters();
  const drafts = letters.filter((l) => l.status === 'draft');
  const sent = letters.filter((l) => l.status !== 'draft');
  const subs = listSubscribers(200);

  return (
    <>
      <Notice searchParams={searchParams} />
      {!address && (
        <div className="setup"><strong>One-time setup:</strong> add a mailing address below (a P.O. box is fine). US law (CAN-SPAM)
          requires it in every newsletter, so sending stays locked until it’s set.</div>
      )}
      <div className="btns" style={{ marginBottom: '1.2rem' }}><Link className="btn" href="/studio/newsletter/new">+ New newsletter</Link></div>

      <div className="kpis">
        <a className="kpi" href="#subscribers" style={{ textDecoration: 'none' }}><div className="n">{active.toLocaleString('en-US')}</div><div className="l">On the list</div></a>
        <div className="kpi"><div className="n">{unsubscribed.toLocaleString('en-US')}</div><div className="l">Unsubscribed</div></div>
      </div>

      <div className="card"><h2>Drafts{drafts.length ? ` (${drafts.length})` : ''}</h2>
        {!drafts.length ? (
          <div className="empty">No drafts. Start one with <strong>+ New newsletter</strong> — it saves as you go, so you can finish it later.</div>
        ) : (
          <ul className="list">
            {drafts.map((l) => (
              <li key={l.id}>
                <Link className="row" href={`/studio/newsletter/${l.id}`}>
                  <span style={{ minWidth: 0 }}>
                    <span className="t">{l.subject || '(no subject yet)'}</span><br />
                    <span className="s">Last edited {shortDate(l.updated_at)}, {timeOf(l.updated_at)} · {plural(l.blocks.length, 'block')}</span>
                  </span>
                  <span className="btn sm" style={{ whiteSpace: 'nowrap' }}>Edit</span>
                </Link>
                <span className="btns" style={{ flexWrap: 'nowrap' }}>
                  <form action={duplicate} className="inline"><input type="hidden" name="id" value={l.id} />
                    <button className="ic" title="Duplicate" aria-label="Duplicate draft">⧉</button></form>
                  <form action={deleteDraft} className="inline"><input type="hidden" name="id" value={l.id} />
                    <ConfirmButton className="ic" title="Delete" aria-label="Delete draft" message="Delete this draft?">✕</ConfirmButton></form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card"><h2>Sent</h2>
        {!sent.length ? <div className="empty">Nothing sent yet.</div> : (
          <ul className="list">
            {sent.map((l) => (
              <li key={l.id}>
                <Link className="row" href={`/studio/newsletter/${l.id}`}>
                  <span style={{ minWidth: 0 }}>
                    <span className="t">{l.subject || '(no subject)'}</span><br />
                    <span className="s">Sent {l.sent_at ? `${shortDate(l.sent_at)}, ${year(l.sent_at)}` : ''} · {l.delivered.toLocaleString('en-US')} delivered</span>
                  </span>
                  <span className="r">{l.status === 'sent' ? <Chip kind="paid">sent</Chip> : <Chip kind="sent">sending</Chip>}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card"><h2>Mailing address (footer)</h2>
          <form action={saveMailingAddress}>
            <label className="f"><span>Shown at the bottom of every newsletter</span>
              <textarea name="address" rows={2} maxLength={300} defaultValue={address} placeholder={`${config.businessName}\nP.O. Box 123, Springfield, ST 00000`} /></label>
            <button className="btn ghost" type="submit">Save address</button>
          </form>
        </div>
        <div className="card"><h2>Add or remove someone</h2>
          <form action={addSubscriber}>
            <div className="fr">
              <label className="f"><span>Email</span><input type="email" name="email" required maxLength={200} /></label>
              <label className="f"><span>Name (optional)</span><input type="text" name="name" maxLength={100} /></label>
            </div>
            <label className="check"><input type="checkbox" name="consent" value="1" required /> They asked to join the list</label>
            <button className="btn ghost" type="submit">Add to list</button>
          </form>
          <form action={removeSubscriber} style={{ marginTop: '1.2rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
            <label className="f"><span>Unsubscribe an email</span><input type="email" name="email" required maxLength={200} /></label>
            <button className="btn sm danger" type="submit">Unsubscribe</button>
          </form>
        </div>
      </div>

      <div className="card" id="subscribers">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '.9rem' }}>
          <h2 style={{ margin: 0 }}>Subscribers</h2>
          {/* A plain link: a CSV download shouldn't be prefetched. */}
          {active > 0 && <a className="btn sm ghost" href="/studio/subscribers.csv" download>Download CSV ↓</a>}
        </div>
        {!subs.length ? (
          <div className="empty">No one yet. People join from the signup form on your site, or add them above.</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="subs">
                <thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Joined</th></tr></thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.email} style={s.unsubscribed_at ? { opacity: 0.45 } : undefined}>
                      <td>{s.email}</td>
                      <td>{s.name || '—'}</td>
                      <td>{s.unsubscribed_at ? `unsubscribed ${shortDate(s.unsubscribed_at)}` : s.source || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{shortDate(s.subscribed_at)}, {year(s.subscribed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {active + unsubscribed > subs.length && (
              <p className="muted" style={{ margin: '.7rem 0 0' }}>Showing the most recent {subs.length}. The CSV has everyone still on the list.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
