import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session.ts';
import { all } from '@/lib/db.ts';
import { draftFor } from '@/lib/package-draft.ts';
import { Notice, type SP } from '@/components/ui.tsx';
import { PackageForm } from '../../PackageForm.tsx';

export const metadata = { title: 'Edit package' };

export default async function EditPackage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await requireAdmin();
  const id = Number((await params).id);
  const draft = draftFor({ editId: id });
  if (!draft) notFound();
  return (
    <>
      <Notice searchParams={searchParams} />
      <p style={{ margin: '0 0 .5rem' }}><Link className="muted" href={`/studio/packages/${id}`}>← Back to the package</Link></p>
      <h1 className="page">Edit package</h1>
      <PackageForm draft={draft} templates={[]} clients={all<{ id: number; name: string }>('SELECT id, name FROM clients WHERE id = ?', draft.client_id)} />
    </>
  );
}
