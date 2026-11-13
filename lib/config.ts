// All configuration comes from environment variables (.env.local in development).
// Read lazily so tests can set process.env first.

const env = (key: string, fallback = ''): string => process.env[key]?.trim() || fallback;

export const config = {
  get businessName() { return env('BUSINESS_NAME', 'Acme Studio'); },
  get ownerName() { return env('OWNER_NAME', 'Sam'); },
  get siteUrl() { return env('SITE_URL', 'http://localhost:3000').replace(/\/+$/, ''); },
  get siteHost() { try { return new URL(this.siteUrl).hostname; } catch { return 'localhost'; } },
  get notifyEmail() { return env('NOTIFY_EMAIL', 'owner@example.com'); },
  get fromEmail() { return env('FROM_EMAIL', `no-reply@${this.siteHost}`); },
  get smtpUrl() { return env('SMTP_URL'); },
  /** Venmo username without "@"; empty turns the Venmo button off. */
  get venmo() { return env('VENMO').replace(/^@/, ''); },
  /** "instagram=https://…,facebook=https://…" → links for the newsletter's Social block. */
  get socialLinks(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const pair of env('SOCIAL_LINKS').split(',')) {
      const [k, ...rest] = pair.split('=');
      const url = rest.join('=').trim();
      if (k?.trim() && /^https?:\/\//.test(url)) out[k.trim().toLowerCase()] = url;
    }
    return out;
  },
  get adminUser() { return env('ADMIN_USER', 'admin'); },
  get passwordHash() { return env('ADMIN_PASSWORD_HASH'); },
  get secret() {
    const s = env('APP_SECRET');
    if (s.length < 32) throw new Error('APP_SECRET must be set to at least 32 characters (run `npm run setup`).');
    return s;
  },
  get trustedProxies() { return Math.max(0, Number.parseInt(env('TRUSTED_PROXIES', '1'), 10) || 0); },
  get dataDir() { return env('DATA_DIR', `${process.cwd()}/data`); },
};
