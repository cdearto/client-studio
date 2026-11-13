'use client';
// Pick people, write one message ({first} = their first name), then send each
// as a private text from your own phone, one tap per person. No one sees who
// else got it, and nothing needs an SMS provider.
import { useState } from 'react';

export type Recipient = { id: number; name: string; first: string; phone: string; tags: string[] };
const PICKS = [['all', 'Everyone'], ['week', 'Sessions this week'], ['active', 'Active packages'], ['renew', 'Due to renew'], ['unpaid', 'Unpaid']] as const;

export function TextComposer({ recipients }: { recipients: Recipient[] }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState('Hi {first}, ');
  const [sent, setSent] = useState<Set<number>>(new Set());
  const chosen = recipients.filter((r) => picked.has(r.id));
  const quick = (tag: string) => setPicked(new Set(recipients.filter((r) => tag === 'all' || r.tags.includes(tag)).map((r) => r.id)));
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bodyFor = (r: Recipient) => message.replaceAll('{first}', r.first);

  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <section className="card">
        <h3 className="sub">1. Who</h3>
        <div className="btns" style={{ marginBottom: '.8rem' }}>
          {PICKS.map(([tag, label]) => <button key={tag} type="button" className="btn sm ghost" onClick={() => quick(tag)}>{label}</button>)}
          <button type="button" className="btn sm ghost" onClick={() => setPicked(new Set())}>None</button>
        </div>
        <div className="txlist">
          {recipients.map((r) => (
            <label key={r.id} className="check"><input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} /> {r.name}</label>
          ))}
        </div>
      </section>
      <section className="card">
        <h3 className="sub">2. Message</h3>
        <label className="f"><span>{'{first}'} becomes each person’s first name</span>
          <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        <h3 className="sub">3. Send ({chosen.length})</h3>
        {chosen.length === 0 ? <p className="empty">Pick people first.</p> : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>Tap each one: Messages opens with their text ready. Send it, come back, tap the next.</p>
            <ul className="list">
              {chosen.map((r) => (
                <li key={r.id} style={sent.has(r.id) ? { opacity: 0.55 } : undefined}>
                  <span className="t">{r.name}</span>
                  <a className="btn sm" href={`sms:${r.phone}?&body=${encodeURIComponent(bodyFor(r))}`} onClick={() => setSent((s) => new Set(s).add(r.id))}>{sent.has(r.id) ? 'Sent ✓' : 'Text'}</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
