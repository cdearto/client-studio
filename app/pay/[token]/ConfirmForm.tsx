'use client';
// A one-button form that asks first ("Book Tue, Jan 5 · 9:00 AM?") and can't be double-tapped.
// The page re-keys it on every render, so a form that survives an action starts fresh.
import { useState } from 'react';

type Props = {
  action: (form: FormData) => Promise<void>;
  confirm: string;
  className?: string;
  label: string;
  children: React.ReactNode;   // hidden inputs
};

export function ConfirmForm({ action, confirm, className, label, children }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <form action={action} onSubmit={(e) => {
      if (busy || !window.confirm(confirm)) e.preventDefault();
      else setBusy(true);
    }}>
      {children}
      <button type="submit" className={className} disabled={busy}>{label}</button>
    </form>
  );
}
