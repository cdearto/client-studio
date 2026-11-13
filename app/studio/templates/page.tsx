import Link from 'next/link';
import { requireAdmin } from '@/lib/session.ts';
import { listTemplates } from '@/lib/studio.ts';
import { money, plural, dollarsInput } from '@/lib/format.ts';
import { Notice, type SP } from '@/components/ui.tsx';
import { saveTemplate, toggleTemplate } from './actions.ts';

export const metadata = { title: 'Templates' };

export default async function Templates({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const templates = listTemplates();
  const editId = Number((await searchParams).edit);
  const edit = templates.find((t) => t.id === editId);
  return (
    <>
      <Notice searchParams={searchParams} />
      <h1 className="page">Package templates</h1>
      <p className="muted" style={{ marginTop: '-.6rem' }}>Your usual packages. Picking one pre-fills a new package; you can still change everything per client.</p>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2>{edit ? 'Edit template' : 'New template'}</h2>
          <form action={saveTemplate} key={edit?.id ?? 'new'}>
            <input type="hidden" name="id" value={edit?.id ?? 0} />
            <label className="f"><span>Name</span><input type="text" name="name" defaultValue={edit?.name} placeholder="e.g. 10-Session Pack" required /></label>
            <div className="fr">
              <label className="f"><span>Sessions</span><input type="number" name="session_count" min={1} max={500} defaultValue={edit?.session_count ?? 10} /></label>
              <label className="f"><span>Minutes each</span><input type="number" name="session_minutes" min={15} max={480} step={5} defaultValue={edit?.session_minutes ?? 60} /></label>
              <label className="f"><span>Price ($)</span><input type="text" name="price" inputMode="decimal" defaultValue={edit ? dollarsInput(edit.price_cents) : ''} /></label>
            </div>
            <label className="f"><span>What’s included (optional)</span><textarea name="description" rows={2} defaultValue={edit?.description} /></label>
            <div className="btns"><button className="btn ghost">Save template</button>{edit && <Link className="muted" href="/studio/templates">Cancel</Link>}</div>
          </form>
        </section>
        <section className="card">
          <h2>Templates</h2>
          {templates.length === 0 ? <p className="empty">None yet.</p> : (
            <ul className="list">
              {templates.map((t) => (
                <li key={t.id} style={t.active ? undefined : { opacity: 0.5 }}>
                  <Link className="row" href={`/studio/templates?edit=${t.id}`}><span><span className="t">{t.name}</span><br /><span className="s">{plural(t.session_count, 'session')} · {t.session_minutes} min · {money(t.price_cents)}</span></span></Link>
                  <form action={toggleTemplate}><input type="hidden" name="id" value={t.id} /><button className="btn sm ghost">{t.active ? 'Hide' : 'Show'}</button></form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
