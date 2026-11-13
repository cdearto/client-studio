'use server';
import { requireAdmin } from '@/lib/session.ts';
import { run, now } from '@/lib/db.ts';
import { text, int, done } from '@/lib/form.ts';

/** Create or update a client. New clients go straight to setting up their package. */
export async function saveClient(form: FormData): Promise<void> {
  await requireAdmin();
  const id = int(form, 'id', 0, 1e9, 0);
  const name = text(form, 'name', 100);
  if (!name) done(id ? `/studio/clients/${id}` : '/studio/clients/new', 'The client needs a name.', 'err');
  const fields = [name, text(form, 'email', 200), text(form, 'phone', 40), text(form, 'notes', 4000)];
  if (id) {
    run('UPDATE clients SET name = ?, email = ?, phone = ?, notes = ? WHERE id = ?', ...fields, id);
    done(`/studio/clients/${id}`, 'Client saved.');
  }
  const newId = Number(run('INSERT INTO clients (name, email, phone, notes, created_at) VALUES (?, ?, ?, ?, ?)', ...fields, now()).lastInsertRowid);
  done(`/studio/packages/new?client=${newId}`, 'Client added — now set up their package.');
}
