'use server';
import { requireAdmin } from '@/lib/session.ts';
import { run } from '@/lib/db.ts';
import { text, int, done } from '@/lib/form.ts';
import { parseCents } from '@/lib/format.ts';

export async function saveTemplate(form: FormData): Promise<void> {
  await requireAdmin();
  const id = int(form, 'id', 0, 1e9, 0);
  const f = [text(form, 'name', 100), text(form, 'description', 1000), int(form, 'session_count', 1, 500, 1), int(form, 'session_minutes', 15, 480, 60), parseCents(text(form, 'price', 20))] as const;
  if (!f[0]) done('/studio/templates', 'Give the template a name.', 'err');
  if (id) run('UPDATE templates SET name = ?, description = ?, session_count = ?, session_minutes = ?, price_cents = ? WHERE id = ?', ...f, id);
  else run('INSERT INTO templates (name, description, session_count, session_minutes, price_cents) VALUES (?, ?, ?, ?, ?)', ...f);
  done('/studio/templates', 'Template saved.');
}

export async function toggleTemplate(form: FormData): Promise<void> {
  await requireAdmin();
  run('UPDATE templates SET active = 1 - active WHERE id = ?', int(form, 'id', 1, 1e9));
  done('/studio/templates', 'Template updated.');
}
