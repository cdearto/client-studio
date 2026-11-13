import Link from 'next/link';
import { config } from '@/lib/config.ts';
import { starterLayouts } from '@/lib/newsletter-render.ts';
import { brand } from '@/lib/newsletter.ts';
import { requireAdmin } from '@/lib/session.ts';
import { createFromLayout } from '../actions.ts';

export const metadata = { title: 'New newsletter' };

export default async function NewNewsletterPage() {
  await requireAdmin();
  const layouts = Object.entries(starterLayouts(brand(), config.ownerName));
  return (
    <>
      <p style={{ margin: '0 0 .5rem' }}><Link className="muted" href="/studio/newsletter">← Newsletter</Link></p>
      <h1 className="page">New newsletter</h1>
      <p className="muted" style={{ margin: '-.4rem 0 1.2rem' }}>Pick a starting layout. Every block can be changed, moved or removed.</p>
      <div className="tplgrid">
        {layouts.map(([key, l]) => (
          <form key={key} action={createFromLayout}>
            <input type="hidden" name="layout" value={key} />
            <button className="tplcard" type="submit">
              {/* A wireframe of the layout's blocks. */}
              <span className="tplthumb" aria-hidden="true">
                {l.blocks.map((b, i) => <i key={i} className={`tt-${b.type}${b.type === 'heading' && b.size === 'm' ? ' sm' : ''}`} />)}
              </span>
              <strong>{l.name}</strong><span className="muted">{l.description}</span>
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
