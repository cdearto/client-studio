'use client';
import { useState } from 'react';
import { sent } from '../actions.ts';

/** "Text from my phone" opens Messages with the text filled in; tapping it (or Copy) also marks the package sent. */
export function SendButtons({ id, smsHref, link, hasPhone }: { id: number; smsHref: string; link: string; hasPhone: boolean }) {
  const [copied, setCopied] = useState(false);
  const markSent = () => { const f = new FormData(); f.set('id', String(id)); void sent(f); };
  return (
    <>
      <div className="sendgrid">
        {hasPhone
          ? <a className="btn" href={smsHref} onClick={markSent}>Text from my phone</a>
          : <span className="btn" aria-disabled="true" title="Add a mobile number first">Text from my phone</span>}
        <button type="button" className="btn ghost" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); markSent(); }}>
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
      </div>
      <div className="linkbox"><input type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Private link" /></div>
    </>
  );
}
