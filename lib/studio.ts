// Read models for the Studio screens.
import { all, one, scalar } from './db.ts';
import { startOfToday } from './format.ts';
import { leftToBook, type Package, type PackageStatus, type Session } from './booking.ts';

export type Client = { id: number; name: string; email: string; phone: string; notes: string; created_at: number };

/** A client plus their current package (newest one not withdrawn) and its usage. */
export type ClientRow = Client & {
  package_id: number | null; title: string | null; session_count: number; price_cents: number;
  status: PackageStatus | null; venmo_claimed_at: number | null; used: number; next_at: number | null; last_at: number | null;
};
export const left = (r: Pick<ClientRow, 'session_count' | 'used'>) => Math.max(0, r.session_count - r.used);

export function clientsWithCurrent(clientId?: number): ClientRow[] {
  return all<ClientRow>(`SELECT c.*, p.id AS package_id, p.title, COALESCE(p.session_count, 0) AS session_count, COALESCE(p.price_cents, 0) AS price_cents,
      p.status, p.venmo_claimed_at,
      (SELECT COUNT(*) FROM sessions s WHERE s.package_id = p.id AND s.status = 'done') AS used,
      (SELECT MIN(starts_at) FROM sessions s WHERE s.package_id = p.id AND s.status = 'scheduled' AND s.starts_at >= ?) AS next_at,
      (SELECT MAX(starts_at) FROM sessions s WHERE s.package_id = p.id AND s.status = 'done') AS last_at
    FROM clients c
    LEFT JOIN packages p ON p.id = (SELECT x.id FROM packages x WHERE x.client_id = c.id AND x.status <> 'cancelled' ORDER BY x.created_at DESC, x.id DESC LIMIT 1)
    ${clientId ? 'WHERE c.id = ?' : ''} ORDER BY c.name COLLATE NOCASE`, startOfToday(), ...(clientId ? [clientId] : []));
}

export const getClient = (id: number) => one<Client>('SELECT * FROM clients WHERE id = ?', id);

export type UpcomingSession = Session & { client: string; title: string; package_status: PackageStatus };

export function scheduleData() {
  const today = startOfToday();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const clients = clientsWithCurrent();
  const renew = clients.filter((c) => c.package_id && left(c) <= 1).sort((a, b) => left(a) - left(b));
  // Everyone with nothing booked who still has sessions to book (or no package yet),
  // so no client quietly drops off the schedule.
  const unscheduled = clients.filter((c) => !c.next_at && (!c.package_id || (left(c) > 0 && leftToBook({ id: c.package_id, session_count: c.session_count }) > 0)));
  return {
    clientCount: clients.length,
    sessionsThisWeek: scalar(`SELECT COUNT(*) FROM sessions s JOIN packages p ON p.id = s.package_id
      WHERE s.status = 'scheduled' AND p.status <> 'cancelled' AND s.starts_at BETWEEN ? AND ?`, today, today + 7 * 86400),
    owed: scalar("SELECT COALESCE(SUM(price_cents), 0) FROM packages WHERE status = 'sent'"),
    owedCount: scalar("SELECT COUNT(*) FROM packages WHERE status = 'sent'"),
    paidThisMonth: scalar("SELECT COALESCE(SUM(price_cents), 0) FROM packages WHERE status = 'paid' AND paid_at >= ?", monthStart.getTime() / 1000),
    venmoToConfirm: all<Package & { client: string }>(`SELECT p.*, c.name AS client FROM packages p JOIN clients c ON c.id = p.client_id
      WHERE p.status IN ('draft', 'sent') AND p.venmo_claimed_at IS NOT NULL AND p.venmo_rejected_at IS NULL ORDER BY p.venmo_claimed_at`),
    renew,
    drafts: all<{ id: number; title: string; client: string }>(`SELECT p.id, p.title, c.name AS client FROM packages p JOIN clients c ON c.id = p.client_id
      WHERE p.status = 'draft' ORDER BY p.created_at DESC LIMIT 10`),
    unscheduled,
    // Sessions in the last 3 weeks still marked "scheduled": did they happen?
    toMark: all<UpcomingSession>(`SELECT s.*, c.name AS client, p.title, p.status AS package_status FROM sessions s
      JOIN packages p ON p.id = s.package_id JOIN clients c ON c.id = p.client_id
      WHERE s.status = 'scheduled' AND p.status <> 'cancelled' AND s.starts_at < ? AND s.starts_at > ? ORDER BY s.starts_at DESC LIMIT 10`, today, today - 21 * 86400),
    upcoming: all<UpcomingSession>(`SELECT s.*, c.name AS client, p.title, p.status AS package_status FROM sessions s
      JOIN packages p ON p.id = s.package_id JOIN clients c ON c.id = p.client_id
      WHERE s.status = 'scheduled' AND p.status <> 'cancelled' AND s.starts_at >= ? ORDER BY s.starts_at LIMIT 60`, today),
  };
}

export const packagesForClient = (clientId: number) =>
  all<Package & { used: number }>(`SELECT p.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
      (SELECT COUNT(*) FROM sessions s WHERE s.package_id = p.id AND s.status = 'done') AS used
    FROM packages p JOIN clients c ON c.id = p.client_id WHERE p.client_id = ? ORDER BY p.created_at DESC, p.id DESC`, clientId);

export type Template = { id: number; name: string; description: string; session_count: number; session_minutes: number; price_cents: number; active: number };
export const listTemplates = (activeOnly = false) => all<Template>(`SELECT * FROM templates ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY active DESC, name COLLATE NOCASE`);
