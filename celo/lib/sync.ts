import 'server-only';
import { q, one, newId } from './db';
import { getSecret } from './settings';
import { syncStripe } from './integrations/stripe';
import { dedupeClients, importStripeClients } from './clients';
import { syncCalendar, syncGmail, syncGoogleAds } from './integrations/google';
import { syncAllMeta } from './meta/sync';
import { dueOccurrences, duePayments, toDay, type Cadence, type PayCadence } from './recurring';

export type SourceId = 'stripe' | 'calendar' | 'gmail' | 'meta' | 'google_ads';

export const SOURCES: { id: SourceId; label: string; run: () => Promise<string> }[] = [
  {
    id: 'stripe',
    label: 'Stripe',
    run: async () => {
      const msg = await syncStripe();
      await dedupeClients();
      const added = await importStripeClients();
      return added ? `${msg}, ${added} new client${added === 1 ? '' : 's'}` : msg;
    },
  },
  { id: 'calendar', label: 'Google Calendar', run: syncCalendar },
  { id: 'gmail', label: 'Gmail', run: syncGmail },
  { id: 'meta', label: 'Meta Ads', run: syncAllMeta },
  { id: 'google_ads', label: 'Google Ads', run: syncGoogleAds },
];

export async function configured(): Promise<Record<SourceId, boolean>> {
  const [stripe, gid, gsec, grefresh, adsDev, meta] = await Promise.all([
    getSecret('stripe.secret_key'),
    getSecret('google.client_id'),
    getSecret('google.client_secret'),
    getSecret('google.refresh_token'),
    getSecret('google_ads.developer_token'),
    getSecret('meta.access_token'),
  ]);
  const metaConnections = await one<{ n: number }>(`SELECT count(*)::int AS n FROM meta_connections`);
  const google = Boolean(gid && gsec && grefresh);
  return { stripe: Boolean(stripe), calendar: google, gmail: google, meta: Boolean(meta) || (metaConnections?.n ?? 0) > 0, google_ads: google && Boolean(adsDev) };
}

export type SyncRun = { source: SourceId; last_started_at: string | null; last_ok_at: string | null; ok: boolean; message: string };

export async function syncRuns(): Promise<Map<SourceId, SyncRun>> {
  const rows = await q<SyncRun>(`SELECT source, last_started_at::text, last_ok_at::text, ok, message FROM sync_runs`);
  return new Map(rows.map((r) => [r.source, r]));
}

/** Run every configured source (or just `only`). Each source fails on its own; one bad key never blocks the rest. */
export async function runSync(only?: SourceId[]): Promise<Record<string, string>> {
  const which = await configured();
  const out: Record<string, string> = {};
  for (const s of SOURCES) {
    if (only && !only.includes(s.id)) continue;
    if (!which[s.id]) {
      out[s.id] = 'not configured';
      continue;
    }
    await q(
      `INSERT INTO sync_runs (source, last_started_at) VALUES ($1, now()) ON CONFLICT (source) DO UPDATE SET last_started_at = now()`,
      [s.id],
    );
    try {
      const msg = await s.run();
      await q(`UPDATE sync_runs SET ok = true, last_ok_at = now(), message = $2 WHERE source = $1`, [s.id, msg]);
      out[s.id] = msg;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await q(`UPDATE sync_runs SET ok = false, message = $2 WHERE source = $1`, [s.id, msg.slice(0, 500)]);
      out[s.id] = `error: ${msg}`;
    }
  }
  out.recurring = `${await materializeRecurring()} tasks created`;
  out.recurring_payments = `${await materializeRecurringPayments()} payments logged`;
  return out;
}

/** Oldest successful sync across configured sources, used to decide whether a page view should trigger a refresh. */
export async function staleSeconds(): Promise<number | null> {
  const which = await configured();
  const ids = (Object.keys(which) as SourceId[]).filter((k) => which[k]);
  if (!ids.length) return null;
  const row = await one<{ s: number | null }>(
    `SELECT EXTRACT(EPOCH FROM (now() - min(COALESCE(last_started_at, 'epoch'::timestamptz))))::float AS s
     FROM (SELECT unnest($1::text[]) AS source) want LEFT JOIN sync_runs USING (source)`,
    [ids],
  );
  return row?.s ?? null;
}

/** Create task rows for recurring rules whose next occurrence is within the coming week. Idempotent. */
export async function materializeRecurring(today = toDay(new Date())): Promise<number> {
  const rules = await q<{ id: string; client_id: string | null; title: string; cadence: Cadence; anchor: number; priority: number; last: string | null }>(
    `SELECT id, client_id, title, cadence, anchor, priority, last_generated_for::text AS last FROM recurring_tasks WHERE active`,
  );
  let created = 0;
  for (const r of rules) {
    const due = dueOccurrences(r.cadence, r.anchor, today, r.last);
    if (!due.length) continue;
    // Claim the occurrences first so two concurrent requests can't both create them.
    const claimed = await q(
      `UPDATE recurring_tasks SET last_generated_for = $2 WHERE id = $1 AND last_generated_for IS NOT DISTINCT FROM $3::date RETURNING id`,
      [r.id, due[due.length - 1], r.last],
    );
    if (!claimed.length) continue;
    for (const day of due) {
      await q(
        `INSERT INTO tasks (id, client_id, title, status, priority, due_date, recurring_id, position) VALUES ($1,$2,$3,'week',$4,$5,$6,$7)`,
        [newId('tsk'), r.client_id, r.title, r.priority, day, r.id, Date.now()],
      );
      created++;
    }
  }
  return created;
}

/** Log each recurring off-Stripe payment whose date has come. Idempotent (claims the schedule first). */
export async function materializeRecurringPayments(today = toDay(new Date())): Promise<number> {
  const rows = await q<{ id: string; client_id: string | null; amount_cents: number; currency: string; interval: PayCadence['interval']; interval_count: number; next: string; method: string; description: string; anchor: number }>(
    `SELECT id, client_id, amount_cents, currency, interval, interval_count, next_date::text AS next, method, description,
       COALESCE(EXTRACT(DAY FROM (SELECT min(paid_at) FROM payments WHERE recurring_id = r.id)), EXTRACT(DAY FROM r.next_date))::int AS anchor
     FROM recurring_payments r WHERE active AND next_date <= $1::date`,
    [today],
  );
  let logged = 0;
  for (const r of rows) {
    const anchor = r.anchor || Number(r.next.slice(8));
    const { due, next } = duePayments(r.next, today, { interval: r.interval, interval_count: r.interval_count }, anchor);
    if (!due.length) continue;
    const claimed = await q(`UPDATE recurring_payments SET next_date = $2 WHERE id = $1 AND next_date = $3::date RETURNING id`, [r.id, next, r.next]);
    if (!claimed.length) continue;
    for (const day of due) {
      await q(
        `INSERT INTO payments (id, source, client_id, amount_cents, currency, status, method, description, paid_at, recurring_id)
         VALUES ($1,'manual',$2,$3,$4,'paid',$5,$6,$7,$8)`,
        [newId('man'), r.client_id, r.amount_cents, r.currency, r.method, r.description || 'Recurring payment', `${day}T12:00:00Z`, r.id],
      );
      logged++;
    }
  }
  return logged;
}
