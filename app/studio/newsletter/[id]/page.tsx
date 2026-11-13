import Link from 'next/link';
import { Chip, Notice, type SP } from '@/components/ui.tsx';
import { config } from '@/lib/config.ts';
import { done } from '@/lib/form.ts';
import { when } from '@/lib/format.ts';
import { renderHtml } from '@/lib/newsletter-render.ts';
import { activeCount, brand, getNewsletter, mailingAddress, progress } from '@/lib/newsletter.ts';
import { requireAdmin } from '@/lib/session.ts';
import { Builder, EmailFrame, SendProgress } from './Builder.tsx';

type Props = { params: Promise<{ id: string }>; searchParams: SP };

const load = async (params: Props['params']) => {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) ? getNewsletter(id) : undefined;
};

export async function generateMetadata({ params }: Props) {
  await requireAdmin();
  const n = await load(params);
  return { title: n?.subject || 'Newsletter' };
}

export default async function NewsletterEditPage({ params, searchParams }: Props) {
  await requireAdmin();
  const n = await load(params);
  if (!n) done('/studio/newsletter', 'That newsletter no longer exists.', 'err');
  const back = <p style={{ margin: '0 0 .5rem' }}><Link className="muted" href="/studio/newsletter">← Newsletter</Link></p>;

  if (n.status === 'draft') {
    return (
      <>
        <Notice searchParams={searchParams} />
        {back}
        <Builder id={n.id} initial={{ subject: n.subject, preheader: n.preheader, blocks: n.blocks }} brand={brand()}
          active={activeCount()} hasAddress={mailingAddress() !== ''} testTo={config.notifyEmail} />
      </>
    );
  }

  // Sending or sent: read-only, with progress (the open page drives the sending).
  return (
    <>
      <Notice searchParams={searchParams} />
      {back}
      <h1 className="page">{n.subject || '(no subject)'} {n.status === 'sent' ? <Chip kind="paid">sent</Chip> : <Chip kind="sent">sending</Chip>}</h1>
      {n.preheader && <p className="muted" style={{ margin: '-.6rem 0 1rem' }}>{n.preheader}</p>}
      <SendProgress id={n.id} status={n.status} initial={progress(n.id)} started={n.sent_at ? when(n.sent_at) : ''} />
      <div className="card"><h2>The email</h2>
        <EmailFrame className="nlpreview" title="Newsletter as sent" html={renderHtml(n, brand(), '#')} />
      </div>
    </>
  );
}
