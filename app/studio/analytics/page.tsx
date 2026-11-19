import Link from 'next/link';
import type { SP } from '@/components/ui.tsx';
import { BarList } from '@/components/BarList.tsx';
import { DailyChart } from '@/components/DailyChart.tsx';
import { breakdown, change, daily, newSubscribers, periods, toRange, totals, type Breakdown } from '@/lib/analytics.ts';
import { config } from '@/lib/config.ts';
import { activeCount } from '@/lib/newsletter.ts';
import { requireAdmin } from '@/lib/session.ts';

export const metadata = { title: 'Analytics' };

const EVENT_LABELS: Record<string, string> = {
  signup: 'Newsletter signups', book: 'Booking clicks', contact: 'Contact form', email: 'Email clicks', phone: 'Phone clicks',
  outbound: 'Outbound links', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X',
};
const humanize = (name: string) => (name.charAt(0).toUpperCase() + name.slice(1)).replace(/[_-]+/g, ' ');
const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function Delta({ now, before }: { now: number; before: number }) {
  const pct = change(now, before);
  if (pct === null) return <span className="delta flat">{now > 0 ? 'new' : '—'}</span>;
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return <span className={`delta ${dir}`} title="vs. the period before">{pct > 0 ? '▲ ' : pct < 0 ? '▼ ' : ''}{Math.abs(pct)}%</span>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const range = toRange((await searchParams).range);
  const { current, previous } = periods(range);
  const conv = config.conversions;
  const now = totals(current.from, current.to, conv);
  const before = totals(previous.from, previous.to, conv);
  const list = (kind: Breakdown, limit?: number) => breakdown(kind, current.from, current.to, limit);
  const events = list('events', 12).map((e) => ({ ...e, label: `${EVENT_LABELS[e.label] ?? humanize(e.label)}${conv.includes(e.label) ? ' ★' : ''}` }));
  const subs = activeCount();
  const joined = newSubscribers(current.from, current.to);

  const kpis = [
    { label: 'Visitors', value: fmt(now.visitors), now: now.visitors, before: before.visitors },
    { label: 'Pageviews', value: fmt(now.pageviews), now: now.pageviews, before: before.pageviews },
    { label: 'Conversions', value: fmt(now.conversions), now: now.conversions, before: before.conversions },
    { label: 'Conversion rate', value: `${fmt(now.conversionRate, 1)}%`, now: now.conversionRate, before: before.conversionRate },
  ];

  return (
    <div className="analytics">
      <div className="btns" style={{ justifyContent: 'space-between', marginBottom: '1.2rem' }}>
        <nav className="btns" aria-label="Date range">
          {[7, 30, 90].map((r) => (
            <Link key={r} href={r === 30 ? '/studio/analytics' : `/studio/analytics?range=${r}`} className={`btn sm${r === range ? '' : ' ghost'}`}
              aria-current={r === range ? 'page' : undefined}>Last {r} days</Link>
          ))}
        </nav>
        <a className="btn sm ghost" href={`/studio/analytics.csv?range=${range}`} download>Download CSV ↓</a>
      </div>

      <div className="kpis">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="n">{k.value}</div>
            <div className="l"><span>{k.label}</span><Delta now={k.now} before={k.before} /></div>
          </div>
        ))}
        <Link className="kpi" href="/studio/newsletter#subscribers" style={{ textDecoration: 'none' }}>
          <div className="n">{fmt(subs)}</div>
          <div className="l"><span>On the list</span><span className="delta flat">{joined ? `+${fmt(joined)} new` : ''}</span></div>
        </Link>
      </div>

      <div className="card">
        <h2>Pageviews per day</h2>
        <DailyChart points={daily(current.from, current.to)} />
      </div>

      <div className="grid2 stats">
        <div className="card"><h2>Top pages</h2><BarList rows={list('pages')} /></div>
        <div className="card"><h2>Traffic sources</h2><BarList rows={list('sources')} /></div>
        <div className="card">
          <h2>Conversions &amp; clicks</h2>
          <BarList rows={events} empty='No clicks yet. Add data-track="name" to links, buttons or forms on your site.' />
          {events.length > 0 && <p className="muted">★ counts as a conversion</p>}
        </div>
        <div className="card"><h2>Devices</h2><BarList rows={list('devices', 5)} /></div>
        <div className="card">
          <h2>Top cities</h2><BarList rows={list('cities', 10)} empty="Location comes from your host's geo headers (Vercel, Cloudflare)." />
          <p className="muted">Approximate. Unique visitors.</p>
        </div>
        <div className="card"><h2>Countries</h2><BarList rows={list('countries')} empty="No location data yet." /></div>
      </div>

      <p className="muted">
        Your website’s visits, counted here: no cookies, bots left out. A visitor counts once per day.
        Clients’ private package pages and Studio itself are never recorded.
      </p>
    </div>
  );
}
