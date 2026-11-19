import type { DayPoint } from '@/lib/analytics.ts';

const short = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Pageviews per day as an SVG bar chart; hover a bar for that day's numbers. */
export function DailyChart({ points }: { points: DayPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.pageviews));
  const w = 100 / Math.max(1, points.length);
  return (
    <>
      <svg className="chart" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={`Pageviews per day, last ${points.length} days`}>
        {points.map((p, i) => {
          const h = (p.pageviews / max) * 28;
          return (
            <rect key={p.day} x={i * w + w * 0.1} y={29 - h} width={w * 0.8} height={Math.max(h, 0.15)} rx={0.3}>
              <title>{`${short(p.day)}: ${p.pageviews.toLocaleString('en-US')} pageviews, ${p.visitors.toLocaleString('en-US')} visitors`}</title>
            </rect>
          );
        })}
        <line className="baseline" x1="0" y1="29.05" x2="100" y2="29.05" />
      </svg>
      <div className="chart-axis">
        <span>{short(points[0].day)}</span>
        <span>Peak {max.toLocaleString('en-US')}/day</span>
        <span>{short(points[points.length - 1].day)}</span>
      </div>
    </>
  );
}
