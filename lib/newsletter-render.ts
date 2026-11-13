// Newsletter blocks and email rendering. Pure functions with no server imports,
// so the builder's live preview in the browser runs exactly the code that sends.

export type Align = 'left' | 'center';
export type Block =
  | { type: 'heading'; text: string; size: 'l' | 'm'; align: Align }
  | { type: 'text'; text: string; align: Align }
  | { type: 'image'; src: string; alt: string; link: string; width: 'full' | 'half' }
  | { type: 'button'; label: string; url: string; align: Align; style: 'solid' | 'outline' }
  | { type: 'divider' }
  | { type: 'spacer'; size: 's' | 'm' | 'l' }
  | { type: 'social' };
export type BlockType = Block['type'];

export type Brand = {
  businessName: string; siteUrl: string; siteHost: string; address: string;
  social: [label: string, url: string][];
};
export type Draft = { subject: string; preheader: string; blocks: Block[] };

export const BLOCK_NAMES: Record<BlockType, string> = {
  heading: 'Heading', text: 'Text', image: 'Image', button: 'Button', divider: 'Divider', spacer: 'Spacer', social: 'Social links',
};
export function newBlock(type: BlockType): Block {
  switch (type) {
    case 'heading': return { type, text: '', size: 'l', align: 'left' };
    case 'text': return { type, text: '', align: 'left' };
    case 'image': return { type, src: '', alt: '', link: '', width: 'full' };
    case 'button': return { type, label: '', url: '', align: 'left', style: 'solid' };
    case 'spacer': return { type, size: 'm' };
    default: return { type };
  }
}

// ---- Cleaning (everything from the browser is untrusted) --------------------------
export const safeUrl = (u: unknown): string => (typeof u === 'string' && /^https?:\/\/[^\s<>"]+$/i.test(u.trim()) ? u.trim() : '');
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T => (allowed.includes(v as T) ? (v as T) : allowed[0]);

/** Whitelists block types and fields, requires http(s) URLs, caps lengths; at most 60 blocks. */
export function cleanBlocks(input: unknown): Block[] {
  const list = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return []; } })() : input;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 60).flatMap((b): Block[] => {
    if (!b || typeof b !== 'object') return [];
    const align = pick(b.align, ['left', 'center'] as const);
    switch (b.type) {
      case 'heading': return [{ type: 'heading', text: str(b.text, 200), size: pick(b.size, ['l', 'm'] as const), align }];
      case 'text': return [{ type: 'text', text: str(b.text, 20000).replace(/[^\P{C}\n\t]/gu, ''), align }];
      case 'image': return [{ type: 'image', src: safeUrl(b.src), alt: str(b.alt, 200), link: safeUrl(b.link), width: pick(b.width, ['full', 'half'] as const) }];
      case 'button': return [{ type: 'button', label: str(b.label, 60), url: safeUrl(b.url), align, style: pick(b.style, ['solid', 'outline'] as const) }];
      case 'divider': return [{ type: 'divider' }];
      case 'spacer': return [{ type: 'spacer', size: pick(b.size, ['m', 's', 'l'] as const) }];
      case 'social': return [{ type: 'social' }];
      default: return [];
    }
  });
}

/** Anything worth sending? (A list of empty blocks isn't.) */
export const hasContent = (blocks: Block[]) => blocks.some((b) =>
  ((b.type === 'heading' || b.type === 'text') && b.text !== '') || (b.type === 'image' && b.src !== '') || (b.type === 'button' && b.label !== '' && b.url !== ''));

// ---- HTML -----------------------------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const FONT = 'font-family:Helvetica,Arial,sans-serif;';
const LINK = 'color:#ffffff;text-decoration:underline';

/** One paragraph → safe HTML: escaped first, then **bold**, [label](url) and bare http(s) links. */
export function inline(text: string): string {
  const kept: string[] = [];
  const stash = (html: string) => `\u0000${kept.push(html) - 1}\u0000`;
  let t = esc(text)
    .replace(/\[([^\]\n]{1,200})\]\(((?:https?:\/\/|mailto:)[^\s()<>"]+)\)/gi, (_, label, url) => stash(`<a href="${url}" style="${LINK}">${label}</a>`))
    // Runs on escaped text, so a link stops at an escaped quote or bracket; trailing punctuation isn't part of it.
    .replace(/\bhttps?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<>"'\u0000])+/gi, (m) => {
      const url = m.replace(/[.,;:!?)]+$/, '');
      return stash(`<a href="${url}" style="${LINK}">${url}</a>`) + m.slice(url.length);
    });
  t = t.replace(/\*\*(.+?)\*\*/gs, '<strong style="color:#ffffff">$1</strong>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
}

function blockHtml(b: Block, brand: Brand, preview: boolean): string {
  switch (b.type) {
    case 'heading':
      if (!b.text) return '';
      return b.size === 'l'
        ? `<h1 style="margin:0 0 20px;${FONT}font-weight:bold;font-size:28px;line-height:1.2;letter-spacing:-0.5px;color:#ffffff;text-align:${b.align}">${esc(b.text)}</h1>`
        : `<h2 style="margin:6px 0 12px;${FONT}font-weight:bold;font-size:13px;line-height:1.4;letter-spacing:2px;text-transform:uppercase;color:#ffffff;text-align:${b.align}">${esc(b.text)}</h2>`;
    case 'text':
      return b.text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).filter(Boolean).map((p) =>
        `<p style="margin:0 0 18px;${FONT}font-size:16px;line-height:1.6;color:#e7e6e1;text-align:${b.align};overflow-wrap:anywhere">${inline(p).replace(/\n/g, '<br>')}</p>`).join('\n');
    case 'image': {
      if (!b.src) return preview ? `<div style="margin:0 0 20px;padding:44px 12px;border:1px dashed #3a3a42;border-radius:8px;text-align:center;${FONT}font-size:13px;color:#6a6a64">Image — paste an image link in the editor</div>` : '';
      const w = b.width === 'half' ? 254 : 508;
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${w}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;border-radius:8px;margin:0 auto">`;
      return `<div style="margin:0 0 20px;text-align:center">${b.link ? `<a href="${esc(b.link)}">${img}</a>` : img}</div>`;
    }
    case 'button': {
      if (!b.label || !b.url) return preview && b.label ? `<p style="${FONT}font-size:12px;color:#fca5a5">Button needs a link (https://…)</p>` : '';
      const solid = b.style === 'solid', center = b.align === 'center';
      return `<table role="presentation" cellpadding="0" cellspacing="0" align="${center ? 'center' : 'left'}" style="margin:6px ${center ? 'auto' : '0'} 22px"><tr>`
        + `<td style="border-radius:8px;${solid ? 'background:#ffffff;' : 'border:1px solid #ffffff;'}">`
        + `<a href="${esc(b.url)}" style="display:inline-block;padding:14px 26px;${FONT}font-weight:bold;font-size:14px;letter-spacing:1px;text-decoration:none;color:${solid ? '#0a0a0a' : '#ffffff'}">${esc(b.label)}</a>`
        + `</td></tr></table><div style="clear:both;line-height:0;font-size:0">&nbsp;</div>`;
    }
    case 'divider':
      return '<div style="margin:8px 0 26px;border-top:1px solid #2b2b31;line-height:0;font-size:0">&nbsp;</div>';
    case 'spacer':
      return `<div style="height:${{ s: 8, m: 24, l: 48 }[b.size]}px;line-height:0;font-size:0">&nbsp;</div>`;
    case 'social': {
      if (!brand.social.length) return preview ? `<p style="${FONT}font-size:12px;color:#6a6a64;text-align:center">Set SOCIAL_LINKS to show social links here.</p>` : '';
      const links = brand.social.map(([label, url]) => `<a href="${esc(url)}" style="color:#f4f3ee;text-decoration:none">${esc(label)}</a>`);
      return `<p style="margin:4px 0 20px;${FONT}font-size:12px;letter-spacing:2px;text-transform:uppercase;text-align:center">${links.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</p>`;
    }
  }
}

/** The full email. `preview` shows hints for incomplete blocks. */
export function renderHtml(n: Draft, brand: Brand, unsubscribeUrl: string, preview = false): string {
  let content = n.blocks.map((b) => blockHtml(b, brand, preview)).filter(Boolean).join('\n');
  if (!content && preview) content = `<p style="margin:0;${FONT}color:#6a6a64">Add blocks to start building your newsletter.</p>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><title>${esc(n.subject)}</title></head>
<body style="margin:0;padding:0;background:#0a0a0b">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0a0a0b">${esc(n.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td align="center" style="padding:6px 0 26px;${FONT}font-size:13px;font-weight:bold;letter-spacing:4px;text-transform:uppercase">
      <a href="${esc(brand.siteUrl)}" style="color:#f4f3ee;text-decoration:none">${esc(brand.businessName)}</a></td></tr>
    <tr><td style="background:#141417;border:1px solid #2b2b31;border-radius:12px;padding:30px 26px 12px">
${content}
    </td></tr>
    <tr><td style="padding:22px 8px 0;${FONT}font-size:12px;line-height:1.6;color:#6a6a64;text-align:center">
      You're getting this because you joined the ${esc(brand.businessName)} list at ${esc(brand.siteHost)}.<br>
      ${esc(brand.address).replace(/\n/g, '<br>')}<br>
      <a href="${esc(unsubscribeUrl)}" style="color:#9c9c95;text-decoration:underline">Unsubscribe</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** Plain-text alternative, built from the same blocks. */
export function renderText(n: Draft, brand: Brand, unsubscribeUrl: string): string {
  const parts = n.blocks.flatMap((b): string[] => {
    switch (b.type) {
      case 'heading': return b.text ? [b.size === 'l' ? b.text.toUpperCase() : b.text] : [];
      case 'text': {
        const t = b.text.trim().replace(/\[([^\]\n]{1,200})\]\(((?:https?:\/\/|mailto:)[^\s()<>"]+)\)/gi, '$1 ($2)').replace(/\*\*(.+?)\*\*/gs, '$1');
        return t ? [t] : [];
      }
      case 'image': return b.src && (b.alt || b.link) ? [`[${b.alt || 'Image'}] ${b.link}`.trim()] : [];
      case 'button': return b.label && b.url ? [`${b.label}: ${b.url}`] : [];
      case 'divider': return ['———'];
      case 'spacer': return [];
      case 'social': return brand.social.map(([label, url]) => `${label}: ${url}`);
    }
  });
  return `${parts.join('\n\n')}\n\n--\n${brand.businessName}\nYou're getting this because you joined the ${brand.businessName} list.\n${brand.address}\nUnsubscribe: ${unsubscribeUrl}\n`;
}

// ---- Starting layouts ----------------------------------------------------------------
export function starterLayouts(brand: Pick<Brand, 'businessName' | 'siteUrl'>, owner: string, month = new Date().toLocaleString('en-US', { month: 'long' })) {
  const book: Block = { type: 'button', label: 'Book a session', url: `${brand.siteUrl}/#contact`, align: 'left', style: 'solid' };
  const sign: Block = { type: 'text', text: `See you soon,\n— ${owner}`, align: 'left' };
  return {
    announcement: {
      name: 'Announcement', description: 'One big piece of news: a photo, a few lines, a button.', subject: `Big news from ${brand.businessName}`,
      blocks: [newBlock('image'), { type: 'heading', text: 'Big news', size: 'l', align: 'left' },
        { type: 'text', text: "Hi everyone,\n\nTell them what's new — keep it short and to the point.", align: 'left' },
        book, sign, { type: 'divider' }, { type: 'social' }] as Block[],
    },
    monthly: {
      name: 'Monthly update', description: 'A few short sections: what’s new, open spots, a call to action.', subject: `${month} at ${brand.businessName}`,
      blocks: [{ type: 'heading', text: `${month} at the studio`, size: 'l', align: 'left' },
        { type: 'text', text: 'Hi everyone, a quick roundup of what’s happening this month.', align: 'left' },
        { type: 'heading', text: 'What’s new', size: 'm', align: 'left' },
        { type: 'text', text: 'New classes, new hours, new offers — whatever’s changed.', align: 'left' }, { type: 'divider' },
        { type: 'heading', text: 'Open spots', size: 'm', align: 'left' },
        { type: 'text', text: 'Which days still have room, and how to grab one.', align: 'left' },
        book, sign, { type: 'divider' }, { type: 'social' }] as Block[],
    },
    blank: { name: 'Blank', description: 'Start from scratch.', subject: '', blocks: [newBlock('heading'), newBlock('text')] },
  };
}
export type LayoutKey = keyof ReturnType<typeof starterLayouts>;
