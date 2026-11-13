import type { Client } from '@/lib/studio.ts';

export function ClientFields({ c }: { c?: Client }) {
  return (
    <>
      <label className="f"><span>Name</span><input type="text" name="name" defaultValue={c?.name} required autoFocus={!c} /></label>
      <div className="fr">
        <label className="f"><span>Mobile</span><input type="tel" name="phone" defaultValue={c?.phone} inputMode="tel" placeholder="(555) 010-1234" /></label>
        <label className="f"><span>Email</span><input type="email" name="email" defaultValue={c?.email} /></label>
      </div>
      <label className="f"><span>Private notes</span><textarea name="notes" rows={3} defaultValue={c?.notes} /></label>
    </>
  );
}
