import type { Row } from '@/lib/analytics.ts';

/** A ranked list with proportional bars. */
export function BarList({ rows, empty = 'No data yet.' }: { rows: Row[]; empty?: string }) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="label" title={r.label}>{r.label || '(none)'}</span>
          <span className="count">{r.count.toLocaleString('en-US')}</span>
          <span className="track"><span className="fill" style={{ width: `${Math.round((100 * r.count) / max)}%` }} /></span>
        </li>
      ))}
    </ul>
  );
}
