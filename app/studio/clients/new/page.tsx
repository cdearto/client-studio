import Link from 'next/link';
import { requireAdmin } from '@/lib/session.ts';
import { ClientFields } from '@/components/ClientFields.tsx';
import { Notice, type SP } from '@/components/ui.tsx';
import { saveClient } from '../actions.ts';

export const metadata = { title: 'New client' };

export default async function NewClient({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  return (
    <>
      <Notice searchParams={searchParams} />
      <p style={{ margin: '0 0 .5rem' }}><Link className="muted" href="/studio/clients">← Clients</Link></p>
      <h1 className="page">New client</h1>
      <form action={saveClient} className="card"><ClientFields /><button className="btn block">Save and set up their package →</button></form>
    </>
  );
}
