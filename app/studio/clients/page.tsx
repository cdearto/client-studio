import Link from 'next/link';
import { requireAdmin } from '@/lib/session.ts';
import { clientsWithCurrent, left } from '@/lib/studio.ts';
import { shortDate } from '@/lib/format.ts';
import { Chip, Notice, StatusChip, type SP } from '@/components/ui.tsx';

export const metadata = { title: 'Clients' };

export default async function Clients({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  // Due to renew first, then everyone else alphabetically.
  const clients = clientsWithCurrent().sort((a, b) => Number(!(a.package_id && left(a) <= 1)) - Number(!(b.package_id && left(b) <= 1)));
  return (
    <>
      <Notice searchParams={searchParams} />
      <div className="top" style={{ marginBottom: '1rem' }}>
        <h1 className="page" style={{ margin: 0 }}>Clients ({clients.length})</h1>
        <span className="btns"><Link className="btn ghost" href="/studio/texts">Text clients</Link><Link className="btn" href="/studio/clients/new">+ New client</Link></span>
      </div>
      <section className="card">
        {clients.length === 0 ? <p className="empty">No clients yet.</p> : (
          <ul className="list">
            {clients.map((c) => (
              <li key={c.id}>
                <Link className="row" href={`/studio/clients/${c.id}`}>
                  <span style={{ minWidth: 0 }}><span className="t">{c.name}</span><br />
                    <span className="s">{c.package_id ? `${c.title} · ${c.used} of ${c.session_count} used` : 'No package yet'}{c.next_at ? ` · next ${shortDate(c.next_at)}` : ''}</span></span>
                  <span className="r">
                    {c.package_id && left(c) === 0 && <Chip kind="renew">Renew</Chip>}
                    {c.package_id && left(c) === 1 && <Chip kind="low">1 left</Chip>}
                    {c.status && c.status !== 'paid' && <> <StatusChip status={c.status} claimed={c.venmo_claimed_at} /></>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
