'use client';
// The newsletter block builder, plus the send-progress view. The live preview runs
// the same renderHtml that sends, so what you see is what subscribers get.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { plural } from '@/lib/format.ts';
import { BLOCK_NAMES, hasContent, newBlock, renderHtml, safeUrl, type Block, type BlockType, type Brand, type Draft } from '@/lib/newsletter-render.ts';
import type { Progress } from '@/lib/newsletter.ts';
import { autosave, deleteDraft, duplicate, retryFailedSends, sendNextBatch, sendTestEmail, startSend } from '../actions.ts';

const ICONS: Record<BlockType, string> = { heading: 'H', text: '¶', image: '▣', button: '▭', divider: '—', spacer: '↕', social: '@' };
const TYPES = Object.keys(BLOCK_NAMES) as BlockType[];
const LR = { left: 'Left', center: 'Center' } as const;
const LINK_URL = /^(?:https?:\/\/|mailto:)[^\s()<>"]+$/i;   // what renderHtml turns into a link
const clock = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Blocks have no ids of their own; a local id keeps React's keys stable when they move.
type Item = { id: number; b: Block };
let nextId = 1;
const item = (b: Block): Item => ({ id: nextId++, b });

type Props = { id: number; initial: Draft; brand: Brand; active: number; hasAddress: boolean; testTo: string };

export function Builder({ id, initial, brand, active, hasAddress, testTo }: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState(initial.subject);
  const [preheader, setPreheader] = useState(initial.preheader);
  const [items, setItems] = useState(() => initial.blocks.map(item));
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [phone, setPhone] = useState(true);
  const [previewTab, setPreviewTab] = useState(false);
  const [status, setStatus] = useState('Draft · all changes saved');
  const [to, setTo] = useState(testTo);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const focusId = useRef<number | null>(null);

  const draft = useMemo<Draft>(() => ({ subject, preheader, blocks: items.map((i) => i.b) }), [subject, preheader, items]);

  // ---- Autosave: a moment after the last change; saves run one at a time, in order.
  const latest = useRef(draft);
  const savedJson = useRef(JSON.stringify(initial));
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const save = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    queue.current = queue.current.then(async () => {
      const snapshot = latest.current, json = JSON.stringify(snapshot);
      if (json === savedJson.current) return;
      setStatus('Saving…');
      try {
        const r = await autosave(id, snapshot);
        savedJson.current = json;   // also on refusal (already sent): retrying wouldn't help
        if (!r.ok) return setStatus(r.error);
        setStatus(JSON.stringify(latest.current) === json ? `Draft · saved ${clock()}` : 'Draft · unsaved changes');
      } catch {
        setStatus('Offline — will retry');
        timer.current = setTimeout(save, 8000);
      }
    });
    return queue.current;
  }, [id]);

  useEffect(() => {
    latest.current = draft;
    if (JSON.stringify(draft) === savedJson.current) return;
    setStatus('Draft · unsaved changes');
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 800);
  }, [draft, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (JSON.stringify(latest.current) !== savedJson.current) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); void save(); };   // leaving via a link: save what's left
  }, [save]);

  // ---- Preview: re-rendered shortly after typing stops, so the frame doesn't flash on every key.
  const [html, setHtml] = useState(() => renderHtml(initial, brand, '#', true));
  useEffect(() => {
    const t = setTimeout(() => setHtml(renderHtml(draft, brand, '#', true)), 250);
    return () => clearTimeout(t);
  }, [draft, brand]);

  // ---- Block list edits
  const setBlock = (itemId: number, b: Block) => setItems((list) => list.map((it) => (it.id === itemId ? { ...it, b } : it)));
  const add = (type: BlockType, at: number | null) => {
    const it = item(newBlock(type));
    focusId.current = it.id;
    setItems((list) => { const i = at ?? list.length; return [...list.slice(0, i), it, ...list.slice(i)]; });
    setInsertAt(null);
  };
  const move = (i: number, by: -1 | 1) => setItems((list) => {
    const next = [...list];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    return next;
  });
  const copy = (i: number) => setItems((list) => [...list.slice(0, i + 1), item(structuredClone(list[i].b)), ...list.slice(i + 1)]);
  const remove = (i: number) => {
    if (window.confirm(`Delete this ${BLOCK_NAMES[items[i].b.type].toLowerCase()} block?`)) setItems((list) => list.filter((_, j) => j !== i));
  };
  // A newly added block scrolls into view with its first field focused.
  const focusNew = (itemId: number) => (el: HTMLDivElement | null) => {
    if (!el || focusId.current !== itemId) return;
    focusId.current = null;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
  };

  // ---- Sending
  const ready = subject.trim() !== '' && hasContent(draft.blocks);
  const sendTest = () => startTransition(async () => {
    setMsg(null);
    await save();
    const r = await sendTestEmail(id, to);
    setMsg(r.ok ? { text: r.message ?? 'Test sent.' } : { text: r.error, err: true });
  });
  const sendAll = () => {
    if (!window.confirm(`Send this to ${plural(active, 'subscriber')}? This can’t be undone.`)) return;
    startTransition(async () => {
      setMsg(null);
      await save();
      const r = await startSend(id);
      // On success the action refreshes the page, which swaps the builder for the progress view.
      if (!r.ok) setMsg({ text: r.error, err: true });
    });
  };
  const close = () => startTransition(async () => { await save(); router.push('/studio/newsletter'); });

  return (
    <div className={`nlb${previewTab ? ' pv' : ''}`}>
      <div className="nlb-top">
        <h1 className="page" style={{ margin: 0 }}>Build your newsletter</h1>
        <span className="btns">
          <span className="muted" role="status">{status}</span>
          <button className="btn sm ghost" type="button" onClick={close} disabled={pending} title="Your draft also saves automatically as you work">Save draft &amp; close</button>
        </span>
      </div>
      <div className="nlb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!previewTab} className={`btn sm${previewTab ? ' ghost' : ''}`} onClick={() => setPreviewTab(false)}>Edit</button>
        <button type="button" role="tab" aria-selected={previewTab} className={`btn sm${previewTab ? '' : ' ghost'}`} onClick={() => { setPreviewTab(true); window.scrollTo(0, 0); }}>Preview</button>
      </div>

      <div className="nlb-cols">
        <section className="nlb-edit">
          <div className="card">
            <label className="f"><span>Subject line</span>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Evenings are open" maxLength={150} /></label>
            <label className="f" style={{ margin: 0 }}><span>Preview text (grey line next to the subject in the inbox)</span>
              <input type="text" value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Optional" maxLength={150} /></label>
          </div>

          <div aria-label="Newsletter blocks">
            {!items.length && <div className="card empty">No blocks yet — add one below.</div>}
            {items.map((it, i) => (
              <div key={it.id}>
                <div className="blk" ref={focusNew(it.id)}>
                  <div className="blk-h">
                    <span className="nm">{BLOCK_NAMES[it.b.type]}</span>
                    <button type="button" className="ic" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="ic" title="Move down" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className="ic" title="Duplicate" aria-label="Duplicate block" onClick={() => copy(i)}>⧉</button>
                    <button type="button" className="ic" title="Delete" aria-label="Delete block" onClick={() => remove(i)}>✕</button>
                  </div>
                  <div className="blk-b"><BlockFields b={it.b} set={(b) => setBlock(it.id, b)} brand={brand} /></div>
                </div>
                {insertAt === i + 1 ? (
                  <div className="insmenu">
                    <AddGrid onAdd={(t) => add(t, i + 1)} />
                    <button type="button" className="btn sm ghost" onClick={() => setInsertAt(null)}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" className="ins" title="Add a block here" aria-label="Add a block here" onClick={() => setInsertAt(i + 1)}>+</button>
                )}
              </div>
            ))}
          </div>

          <div className="card"><h2>Add a block</h2><AddGrid onAdd={(t) => add(t, null)} /></div>

          <div className="card"><h2>Send</h2>
            <div className="logform" style={{ margin: '0 0 1rem' }}>
              <input type="email" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Send a test to" />
              <button className="btn sm ghost" type="button" onClick={sendTest} disabled={pending}>Send test</button>
            </div>
            <button className="btn block" type="button" onClick={sendAll} disabled={pending || !ready || !hasAddress || !active}>
              Send to {plural(active, 'subscriber')}
            </button>
            {msg && <p className={msg.err ? 'err' : 'muted'} role={msg.err ? 'alert' : 'status'} style={{ margin: '.7rem 0 0' }}>{msg.text}</p>}
            {!hasAddress && <p className="muted" style={{ margin: '.7rem 0 0' }}>Add your mailing address on the <Link href="/studio/newsletter">Newsletter page</Link> before sending.</p>}
            {!ready && <p className="muted" style={{ margin: '.7rem 0 0' }}>Add a subject and some content to send.</p>}
            {!active && <p className="muted" style={{ margin: '.7rem 0 0' }}>No one is on the list yet.</p>}
          </div>

          <form action={deleteDraft}>
            <input type="hidden" name="id" value={id} />
            <button className="btn sm danger" type="submit" onClick={(e) => { if (!window.confirm('Delete this draft?')) e.preventDefault(); }}>Delete draft</button>
          </form>
        </section>

        <section className="nlb-preview" aria-label="Preview">
          <div className="pvbar">
            <h2 style={{ margin: 0 }}>Preview</h2>
            <Seg value={phone ? 'phone' : 'desktop'} choices={{ phone: 'Phone', desktop: 'Desktop' }} onChange={(v) => setPhone(v === 'phone')} />
          </div>
          <div className={`pvframe${phone ? ' phone' : ''}`}>
            <EmailFrame title="Newsletter preview" html={html} refit={`${phone}${previewTab}`} />
          </div>
        </section>
      </div>
    </div>
  );
}

// ---- Pieces ----------------------------------------------------------------------

function AddGrid({ onAdd }: { onAdd: (t: BlockType) => void }) {
  return (
    <div className="addgrid">
      {TYPES.map((t) => <button key={t} type="button" onClick={() => onAdd(t)}><b aria-hidden="true">{ICONS[t]}</b><span>{BLOCK_NAMES[t]}</span></button>)}
    </div>
  );
}

function Seg<T extends string>({ value, choices, onChange }: { value: T; choices: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {(Object.keys(choices) as T[]).map((v) => (
        <button key={v} type="button" className={v === value ? 'on' : undefined} aria-pressed={v === value} onClick={() => onChange(v)}>{choices[v]}</button>
      ))}
    </div>
  );
}

function Field({ label, ...input }: { label: string } & React.ComponentProps<'input'>) {
  return <label className="f"><span>{label}</span><input type="text" {...input} /></label>;
}

function BlockFields({ b, set, brand }: { b: Block; set: (b: Block) => void; brand: Brand }) {
  switch (b.type) {
    case 'heading':
      return (
        <>
          <Field label="Heading" value={b.text} maxLength={200} placeholder="Say it big" onChange={(e) => set({ ...b, text: e.target.value })} />
          <div className="opts">
            <Seg value={b.size} choices={{ l: 'Large', m: 'Small caps' }} onChange={(size) => set({ ...b, size })} />
            <Seg value={b.align} choices={LR} onChange={(align) => set({ ...b, align })} />
          </div>
        </>
      );
    case 'text':
      return <TextFields b={b} set={set} />;
    case 'image':
      return (
        <>
          {safeUrl(b.src) && <img className="thumb" src={b.src} alt="" />}
          <Field label="Image link" type="url" inputMode="url" value={b.src} placeholder="https://…" onChange={(e) => set({ ...b, src: e.target.value })} />
          <p className="muted hint">Paste the address of an image that’s already online — on your site, right-click a photo and choose “Copy image address”.</p>
          <Field label="Describe the image (for screen readers)" value={b.alt} maxLength={200} placeholder="e.g. A client stretching in the studio" onChange={(e) => set({ ...b, alt: e.target.value })} />
          <Field label="Link when tapped (optional)" type="url" inputMode="url" value={b.link} placeholder="https://…" onChange={(e) => set({ ...b, link: e.target.value })} />
          <div className="opts"><Seg value={b.width} choices={{ full: 'Full width', half: 'Half' }} onChange={(width) => set({ ...b, width })} /></div>
        </>
      );
    case 'button':
      return (
        <>
          <Field label="Button text" value={b.label} maxLength={60} placeholder="Book a session" onChange={(e) => set({ ...b, label: e.target.value })} />
          <Field label="Link" type="url" inputMode="url" value={b.url} placeholder={`${brand.siteUrl}/#contact`} onChange={(e) => set({ ...b, url: e.target.value })} />
          <div className="opts">
            <Seg value={b.style} choices={{ solid: 'Solid', outline: 'Outline' }} onChange={(style) => set({ ...b, style })} />
            <Seg value={b.align} choices={LR} onChange={(align) => set({ ...b, align })} />
          </div>
        </>
      );
    case 'divider':
      return <p className="muted hint" style={{ margin: 0 }}>A thin line between sections.</p>;
    case 'spacer':
      return <div className="opts"><Seg value={b.size} choices={{ s: 'Small', m: 'Medium', l: 'Large' }} onChange={(size) => set({ ...b, size })} /></div>;
    case 'social':
      return (
        <p className="muted hint" style={{ margin: 0 }}>
          {brand.social.length ? `Shows your links: ${brand.social.map(([label]) => label).join(' · ')}.` : 'No social links are set up yet (SOCIAL_LINKS in the settings).'}
        </p>
      );
  }
}

/** Text with B and link buttons that wrap the selected words in **…** / [text](url). */
function TextFields({ b, set }: { b: Extract<Block, { type: 'text' }>; set: (b: Block) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (kind: 'bold' | 'link') => {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end, value } = ta, sel = value.slice(start, end);
    let out = `**${sel || 'bold text'}**`;
    if (kind === 'link') {
      const url = window.prompt('Link to (https://…)', 'https://')?.trim();
      if (!url || !LINK_URL.test(url)) return;
      out = `[${sel || 'link text'}](${url})`;
    }
    set({ ...b, text: value.slice(0, start) + out + value.slice(end) });
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start, start + out.length); });
  };
  return (
    <>
      <div className="tbar">
        <button type="button" className="ic" title="Bold" aria-label="Bold" onClick={() => wrap('bold')}>B</button>
        <button type="button" className="ic" title="Link" aria-label="Link" onClick={() => wrap('link')}>🔗</button>
      </div>
      <label className="f"><span>Text</span>
        <textarea ref={ref} rows={6} value={b.text} maxLength={20000} placeholder="Write something…" onChange={(e) => set({ ...b, text: e.target.value })} /></label>
      <p className="muted hint">Blank line = new paragraph. Select words, then B for bold or 🔗 for a link.</p>
      <div className="opts"><Seg value={b.align} choices={LR} onChange={(align) => set({ ...b, align })} /></div>
    </>
  );
}

/** The email in a sandboxed frame (no scripts), grown to its content's height. */
export function EmailFrame({ html, title, className, refit }: { html: string; title: string; className?: string; refit?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const fit = useCallback(() => {
    const f = ref.current, doc = f?.contentDocument;
    if (!f || !doc?.documentElement) return;
    f.style.height = '';   // back to the CSS minimum first, so it can shrink too
    f.style.height = `${doc.documentElement.scrollHeight + 4}px`;
  }, []);
  // Again after a width change (the CSS transition takes .2s), and on first load in case
  // the frame finished loading before React attached onLoad.
  useEffect(() => { const t = setTimeout(fit, 250); return () => clearTimeout(t); }, [fit, refit]);
  return <iframe ref={ref} className={className} title={title} sandbox="allow-same-origin" srcDoc={html} onLoad={fit} />;
}

/** Sending progress. While the newsletter is sending, this page sends it, one batch at a time. */
export function SendProgress({ id, status, initial, started }: { id: number; status: 'sending' | 'sent'; initial: Progress; started: string }) {
  const [p, setP] = useState(initial);
  const [running, setRunning] = useState(status === 'sending');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!running) return;
    let stopped = false, t: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await sendNextBatch(id);
        if (stopped) return;
        setP(next);
        if (next.done) { setRunning(false); setNote('All done.'); return; }
        setNote('');
        t = setTimeout(tick, 600);
      } catch {
        if (stopped) return;
        setNote('Connection hiccup — retrying…');
        t = setTimeout(tick, 10000);
      }
    };
    void tick();
    return () => { stopped = true; clearTimeout(t); };
  }, [id, running]);

  const retry = () => startTransition(async () => {
    setP(await retryFailedSends(id));
    setNote('');
    setRunning(true);
  });

  const total = p.sent + p.failed + p.remaining;
  const pct = total ? Math.round((100 * (total - p.remaining)) / total) : 100;
  return (
    <div className="card">
      <h2>{running ? 'Sending' : 'Sent'}</h2>
      <div className="meter"><span style={{ width: `${pct}%` }} /></div>
      <div className="s">{p.sent.toLocaleString('en-US')} delivered · {p.remaining.toLocaleString('en-US')} to go{p.failed ? ` · ${p.failed} failed` : ''}</div>
      <p className="muted" style={{ margin: '.7rem 0 0' }} role="status">
        {running ? note || 'Sending — keep this page open until it finishes.' : [note, started && `Started ${started}.`].filter(Boolean).join(' ')}
      </p>
      <div className="btns" style={{ marginTop: '1rem' }}>
        {!running && p.failed > 0 && <button className="btn sm ghost" type="button" onClick={retry} disabled={pending}>Retry {p.failed} failed</button>}
        <form action={duplicate} className="inline">
          <input type="hidden" name="id" value={id} />
          <button className="btn sm ghost" type="submit">Copy into a new draft</button>
        </form>
      </div>
    </div>
  );
}
