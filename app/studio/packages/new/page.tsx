import Link from 'next/link';
import { requireAdmin } from '@/lib/session.ts';
import { all } from '@/lib/db.ts';
import { listTemplates } from '@/lib/studio.ts';
import { draftFor } from '@/lib/package-draft.ts';
import { Notice, type SP } from '@/components/ui.tsx';
import { PackageForm } from '../PackageForm.tsx';

export const metadata = { title: 'New package' };

export default async function NewPackage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const renewFrom = Number(sp.from) || undefined;
  const draft = draftFor({ renewFrom, clientId: Number(sp.client) || undefined })!;
  const templates = listTemplates(true);
  return (
    <>
      <Notice searchParams={searchParams} />
      <h1 className="page">{renewFrom ? 'Renew package' : 'New package'}</h1>
      {templates.length === 0 && <p className="muted">Tip: <Link href="/studio/templates">set up templates</Link> for your usual packages and they’ll pre-fill this.</p>}
      <PackageForm draft={draft} templates={templates} clients={all<{ id: number; name: string }>('SELECT id, name FROM clients ORDER BY name COLLATE NOCASE')} />
    </>
  );
}
