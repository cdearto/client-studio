'use client';
// New / renew / edit a package. Picking a template pre-fills the fields; dates
// are optional rows (clients can also book their own times from the link).
import { useState } from 'react';
import type { Template, Client } from '@/lib/studio.ts';
import type { PackageDraft } from '@/lib/package-draft.ts';
import { savePackage } from './actions.ts';


export function PackageForm({ draft, clients, templates }: { draft: PackageDraft; clients: Pick<Client, 'id' | 'name'>[]; templates: Template[] }) {
  const [f, setF] = useState(draft);
  const [rows, setRows] = useState(draft.sessions.length ? draft.sessions : []);
  const set = <K extends keyof PackageDraft>(k: K, v: PackageDraft[K]) => setF((x) => ({ ...x, [k]: v }));
  const useTemplate = (id: string) => {
    const t = templates.find((x) => String(x.id) === id);
    if (t) setF((x) => ({ ...x, title: t.name, description: t.description, session_count: t.session_count, session_minutes: t.session_minutes, price: String(t.price_cents / 100) }));
  };

  return (
    <form action={savePackage}>
      <input type="hidden" name="id" value={f.id} />
      <section className="card">
        <h2>Client</h2>
        {f.id ? (
          <><input type="hidden" name="client_id" value={f.client_id} /><p className="t">{clients.find((c) => c.id === f.client_id)?.name}</p></>
        ) : (
          <>
            <label className="f"><span>Client</span>
              <select name="client_id" value={f.client_id} onChange={(e) => set('client_id', Number(e.target.value))}>
                <option value={0}>+ New client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {f.client_id === 0 && (
              <div className="fr">
                <label className="f"><span>Name</span><input type="text" name="new_name" required /></label>
                <label className="f"><span>Mobile</span><input type="tel" name="new_phone" inputMode="tel" /></label>
                <label className="f"><span>Email</span><input type="email" name="new_email" /></label>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Package</h2>
        {!f.id && templates.length > 0 && (
          <label className="f"><span>Start from a template (optional)</span>
            <select defaultValue="" onChange={(e) => useTemplate(e.target.value)}>
              <option value="">—</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        <label className="f"><span>Title the client sees</span>
          <input type="text" name="title" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. 5 Private Sessions" required /></label>
        <div className="fr">
          <label className="f"><span>Sessions</span><input type="number" name="session_count" min={1} max={500} value={f.session_count} onChange={(e) => set('session_count', Number(e.target.value))} inputMode="numeric" /></label>
          <label className="f"><span>Minutes each</span><input type="number" name="session_minutes" min={15} max={480} step={5} value={f.session_minutes} onChange={(e) => set('session_minutes', Number(e.target.value))} inputMode="numeric" /></label>
          <label className="f"><span>Their price ($)</span><input type="text" name="price" value={f.price} onChange={(e) => set('price', e.target.value)} inputMode="decimal" disabled={f.paid} /></label>
        </div>
        {f.paid && <><input type="hidden" name="price" value={f.price} /><p className="muted" style={{ marginTop: '-.5rem' }}>The price is locked once paid.</p></>}
        <label className="f"><span>What’s included (optional)</span><textarea name="description" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="f" style={{ marginBottom: 0 }}><span>A note for them (optional)</span>
          <textarea name="note" rows={3} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Looking forward to working with you! Bring water and wear something comfortable." /></label>
      </section>

      <section className="card" id="dates">
        <h2>Dates (optional)</h2>
        <p className="muted" style={{ marginTop: '-.4rem' }}>Book times now, or let them pick from your hours on their link.</p>
        {rows.map((r, i) => (
          <div className="sessrow" key={r.id || `new-${i}`}>
            <input type="hidden" name="s_id" value={r.id} />
            <div className="when">
              <label className="f"><span>Date</span><input type="date" name="s_date" defaultValue={r.date} required /></label>
              <label className="f"><span>Time</span><input type="time" name="s_time" defaultValue={r.time} required /></label>
            </div>
            <span />
            <span />
            <button type="button" className="btn ghost sm rm" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove date">Remove</button>
          </div>
        ))}
        {rows.length < f.session_count && (
          <button type="button" className="btn ghost sm" onClick={() => setRows([...rows, { id: 0, date: '', time: '09:00' }])}>+ Add a date</button>
        )}
      </section>

      <button className="btn block" type="submit">{f.id ? 'Save package' : 'Create package'}</button>
    </form>
  );
}
