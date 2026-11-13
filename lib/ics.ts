// Minimal iCalendar (.ics) output for the client's "add to calendar" file and the owner's feed.

export type CalEvent = { uid: string; start: number; minutes: number; summary: string; location?: string; description?: string; alarmMinutes?: number };

const esc = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/([\\,;])/g, '\\$1');
const utc = (ts: number) => new Date(ts * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** RFC 5545: lines longer than 75 bytes are folded; continuation lines start with a space. */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function calendar(name: string, events: CalEvent[], opts: { refreshMinutes?: number } = {}): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Client Studio//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`];
  if (opts.refreshMinutes) lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${opts.refreshMinutes}M`, `X-PUBLISHED-TTL:PT${opts.refreshMinutes}M`);
  const stamp = utc(Math.floor(Date.now() / 1000));
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `DTSTART:${utc(e.start)}`, `DTEND:${utc(e.start + e.minutes * 60)}`, `SUMMARY:${esc(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.alarmMinutes) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.summary)}`, `TRIGGER:-PT${e.alarmMinutes}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export const icsResponse = (body: string, filename?: string) => new Response(body, {
  headers: {
    'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store',
    ...(filename ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
  },
});
