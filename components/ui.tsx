// Small presentational pieces shared by Studio screens.
import type { PackageStatus } from '@/lib/booking.ts';

export function Chip({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={`chip ${kind}`}>{children}</span>;
}

/** One chip for a package's state: draft · unpaid · venmo? · paid · withdrawn. */
export function StatusChip({ status, claimed }: { status: PackageStatus; claimed?: number | null }) {
  if (claimed && (status === 'draft' || status === 'sent')) return <Chip kind="venmo">venmo?</Chip>;
  return <Chip kind={status}>{{ sent: 'unpaid', cancelled: 'withdrawn' }[status as string] ?? status}</Chip>;
}

export function Meter({ used, count }: { used: number; count: number }) {
  const left = Math.max(0, count - used);
  return (
    <>
      <div className="meter"><span style={{ width: `${Math.min(100, Math.round((100 * used) / Math.max(1, count)))}%` }} /></div>
      <div className="s">{used} of {count} used · <strong>{left ? `${left} left` : 'all used'}</strong></div>
    </>
  );
}

/** Shows ?notice= / ?error= set by done() in a Server Action. */
export async function Notice({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { notice, error } = await searchParams;
  if (error) return <p className="notice err" role="alert">{error}</p>;
  if (notice) return <p className="notice" role="status">{notice}</p>;
  return null;
}

export type SP = Promise<Record<string, string | undefined>>;
