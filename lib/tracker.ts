/**
 * The browser tracker. It must stay self-contained (no imports, no references
 * outside the function body) because /track.js serves it as source text for
 * sites that aren't built with this app.
 *
 * Records a pageview, plus events for:
 * - any element with data-track="name" (links, buttons) and <form data-track="name"> on submit
 * - mailto: (email), tel: (phone), social and other outbound links
 * - window.track('name') from your own code
 * Returns a function to record a pageview, for client-side navigations.
 */
export function startTracking(endpoint: string): () => void {
  const send = (payload: Record<string, string>) => {
    try {
      const body = JSON.stringify(payload);
      // text/plain keeps cross-origin beacons "simple" (no CORS preflight); the server parses JSON anyway.
      if (!navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'text/plain' }))) {
        void fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true, mode: 'no-cors' });
      }
    } catch { /* never break the page */ }
  };
  const event = (name: string | null) => {
    if (name) send({ type: 'event', name: name.slice(0, 60), path: location.pathname, ref: document.referrer });
  };
  // After a client-side navigation document.referrer is stale, so the previous
  // page's URL is the referrer (which makes the source "Internal").
  let previous = '';
  const pageview = () => {
    send({
      type: 'pageview', path: location.pathname, ref: previous || document.referrer,
      utm: new URLSearchParams(location.search).get('utm_source')?.slice(0, 60) ?? '',
    });
    previous = location.href;
  };

  const social: [RegExp, string][] = [[/instagram\.com/, 'instagram'], [/tiktok\.com/, 'tiktok'], [/facebook\.com|fb\.me/, 'facebook'],
    [/youtube\.com|youtu\.be/, 'youtube'], [/linkedin\.com/, 'linkedin'], [/\/\/(www\.)?(x|twitter)\.com/, 'x'], [/github\.com/, 'github']];
  const nameFor = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null;
    const tagged = target.closest('[data-track]');
    if (tagged && tagged.tagName !== 'FORM') return tagged.getAttribute('data-track');
    const href = (target.closest('a')?.getAttribute('href') ?? '').toLowerCase();
    if (href.startsWith('mailto:')) return 'email';
    if (href.startsWith('tel:')) return 'phone';
    const net = social.find(([re]) => re.test(href));
    if (net) return net[1];
    return /^https?:\/\//.test(href) && !href.includes(location.host) ? 'outbound' : null;
  };

  (window as unknown as { track: (name: string) => void }).track = event;
  document.addEventListener('click', (e) => event(nameFor(e.target)), true);
  document.addEventListener('submit', (e) => {
    if (e.target instanceof HTMLFormElement) event(e.target.getAttribute('data-track'));
  }, true);
  return pageview;
}
