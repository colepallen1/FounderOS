import 'server-only';
import { q, one } from './db';
import { itemsMrrCents, monthSeries, type MonthBucket } from './money';
import { forecastByMonth, forecastCharges, sumWithin, type ForecastCharge, type ForecastSub, type ManualRetainer } from './forecast';
import type { AdTotals, CalEvent, Client, Email, Objective, Payment, Recurring, Subscription, Task } from './types';

import { TZ } from './config';
export { TZ };

export function todayInTz(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const CLIENT_COLS = `id, slug, name, status, services, retainer_cents, start_date::text, renewal_date::text, contact_name, contact_email,
  website, email_domains, stripe_customer_ids, meta_ad_account_id, google_ads_customer_id, notes`;

const TASK_SELECT = `SELECT t.id, t.client_id, c.name AS client_name, c.slug AS client_slug, t.title, t.notes, t.status, t.priority,
  t.due_date::text, t.recurring_id, t.position FROM tasks t LEFT JOIN clients c ON c.id = t.client_id`;

const PAYMENT_SELECT = `SELECT p.id, p.source, p.client_id, c.name AS client_name, c.slug AS client_slug, p.stripe_customer_id,
  NULLIF(COALESCE(NULLIF(sc.name, ''), sc.email), '') AS customer_label, p.amount_cents, p.refunded_cents, p.currency, p.status, p.method,
  p.description, p.failure_message, p.paid_at::text FROM payments p LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN stripe_customers sc ON sc.id = p.stripe_customer_id`;

const SUB_SELECT = `SELECT s.id, s.stripe_customer_id, COALESCE(NULLIF(sc.name, ''), NULLIF(sc.email, ''), s.stripe_customer_id) AS customer_label,
  c.name AS client_name, c.slug AS client_slug, s.status, s.mrr_cents, s.currency, s.current_period_end::text,
  (s.cancel_at_period_end OR s.cancel_at IS NOT NULL) AS cancel_at_period_end, s.description
  FROM subscriptions s LEFT JOIN stripe_customers sc ON sc.id = s.stripe_customer_id
  LEFT JOIN clients c ON c.stripe_customer_ids @> to_jsonb(s.stripe_customer_id)`;

// ── Clients ────────────────────────────────────────────────────────────────

export type ClientSummary = Client & {
  stripe_mrr_cents: number;
  mrr_cents: number;
  mrr_source: 'stripe' | 'manual' | 'none';
  open_tasks: number;
  overdue_tasks: number;
  past_due: boolean;
  ltv_cents: number;
  last_paid_at: string | null;
  ad_spend_30d_cents: number;
};

/** MRR per client: Stripe subscriptions on linked customers if any; otherwise the manual retainer amount. */
export async function listClients(): Promise<ClientSummary[]> {
  const today = todayInTz();
  return q<ClientSummary>(
    `SELECT ${CLIENT_COLS.split(',').map((c) => `c.${c.trim()}`).join(', ')},
      COALESCE(sub.mrr, 0)::int AS stripe_mrr_cents,
      COALESCE(sub.past_due, false) AS past_due,
      CASE WHEN jsonb_array_length(c.stripe_customer_ids) > 0 THEN COALESCE(sub.mrr, 0) ELSE c.retainer_cents END::int AS mrr_cents,
      CASE WHEN jsonb_array_length(c.stripe_customer_ids) > 0 THEN 'stripe' WHEN c.retainer_cents > 0 THEN 'manual' ELSE 'none' END AS mrr_source,
      COALESCE(t.open, 0)::int AS open_tasks, COALESCE(t.overdue, 0)::int AS overdue_tasks,
      COALESCE(p.ltv, 0)::int AS ltv_cents, p.last_paid::text AS last_paid_at,
      COALESCE(a.spend, 0)::int AS ad_spend_30d_cents
    FROM clients c
    LEFT JOIN LATERAL (SELECT sum(s.mrr_cents) AS mrr, bool_or(s.status = 'past_due') AS past_due FROM subscriptions s
      WHERE c.stripe_customer_ids @> to_jsonb(s.stripe_customer_id) AND s.status IN ('active','past_due')) sub ON true
    LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE status <> 'done') AS open,
      count(*) FILTER (WHERE status <> 'done' AND due_date < $1::date) AS overdue FROM tasks WHERE client_id = c.id) t ON true
    LEFT JOIN LATERAL (SELECT sum(amount_cents - refunded_cents) FILTER (WHERE status IN ('paid','refunded')) AS ltv,
      max(paid_at) FILTER (WHERE status = 'paid') AS last_paid FROM payments WHERE client_id = c.id) p ON true
    LEFT JOIN LATERAL (SELECT sum(spend_cents) AS spend FROM ad_metrics WHERE client_id = c.id AND day > $1::date - 30) a ON true
    ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'onboarding' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, c.name`,
    [today],
  );
}

export async function getClientBySlug(slug: string): Promise<ClientSummary | null> {
  const all = await listClients();
  return all.find((c) => c.slug === slug) ?? null;
}

export async function clientOptions(): Promise<{ id: string; name: string }[]> {
  return q(`SELECT id, name FROM clients WHERE status <> 'churned' ORDER BY name`);
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export async function listTasks(clientId?: string): Promise<Task[]> {
  const where = clientId ? `WHERE t.client_id = $1` : '';
  // Done cards older than 14 days drop off the board (they stay in the database).
  const doneCut = `${where ? 'AND' : 'WHERE'} (t.status <> 'done' OR t.completed_at IS NULL OR t.completed_at > now() - interval '14 days')`;
  return q<Task>(`${TASK_SELECT} ${where} ${doneCut} ORDER BY t.position, t.created_at`, clientId ? [clientId] : []);
}

export async function todaysTasks(): Promise<{ overdue: Task[]; today: Task[]; week: Task[] }> {
  const today = todayInTz();
  const open = await q<Task>(`${TASK_SELECT} WHERE t.status <> 'done' ORDER BY t.priority, t.due_date NULLS LAST, t.position`);
  return {
    overdue: open.filter((t) => t.due_date && t.due_date < today),
    today: open.filter((t) => t.due_date === today),
    week: open.filter((t) => (!t.due_date || t.due_date > today) && (t.status === 'week' || t.status === 'progress' || t.status === 'review')),
  };
}

export async function listRecurring(clientId?: string): Promise<Recurring[]> {
  return q<Recurring>(
    `SELECT r.id, r.client_id, c.name AS client_name, r.title, r.cadence, r.anchor, r.priority, r.active
     FROM recurring_tasks r LEFT JOIN clients c ON c.id = r.client_id ${clientId ? 'WHERE r.client_id = $1' : ''} ORDER BY r.created_at`,
    clientId ? [clientId] : [],
  );
}

export async function listObjectives(clientId: string): Promise<Objective[]> {
  return q<Objective>(`SELECT id, client_id, title, target, progress, due_date::text FROM objectives WHERE client_id = $1 ORDER BY due_date NULLS LAST, created_at`, [clientId]);
}

// ── Money ──────────────────────────────────────────────────────────────────

export type MoneySummary = {
  stripeMrr: number;
  manualMrr: number;
  mrr: number;
  activeSubs: number;
  pastDue: number;
  cashThisMonth: number;
  cashLastMonthToDate: number;
  failed30d: number;
  failed30dCents: number;
  series: MonthBucket[];
  currency: string;
};

export async function moneySummary(): Promise<MoneySummary> {
  const [subs, manual, month, failed, monthly, cur] = await Promise.all([
    one<{ mrr: number; n: number; past_due: number }>(
      `SELECT COALESCE(sum(mrr_cents), 0)::int AS mrr, count(*)::int AS n, count(*) FILTER (WHERE status = 'past_due')::int AS past_due
       FROM subscriptions WHERE status IN ('active','past_due')`,
    ),
    one<{ mrr: number }>(
      `SELECT COALESCE(sum(retainer_cents), 0)::int AS mrr FROM clients WHERE status IN ('active','onboarding') AND jsonb_array_length(stripe_customer_ids) = 0`,
    ),
    one<{ this_month: number; last_mtd: number }>(
      `WITH b AS (SELECT date_trunc('month', now() AT TIME ZONE $1) AS m, now() AT TIME ZONE $1 AS n)
       SELECT COALESCE(sum(amount_cents - refunded_cents) FILTER (WHERE (paid_at AT TIME ZONE $1) >= b.m), 0)::int AS this_month,
              COALESCE(sum(amount_cents - refunded_cents) FILTER (WHERE (paid_at AT TIME ZONE $1) >= b.m - interval '1 month'
                AND (paid_at AT TIME ZONE $1) < b.n - interval '1 month'), 0)::int AS last_mtd
       FROM payments, b WHERE status IN ('paid','refunded') GROUP BY b.m, b.n`,
      [TZ],
    ),
    one<{ n: number; cents: number }>(`SELECT count(*)::int AS n, COALESCE(sum(amount_cents), 0)::int AS cents FROM payments WHERE status = 'failed' AND paid_at > now() - interval '30 days'`),
    q<{ k: string; cents: number }>(
      `SELECT to_char(paid_at AT TIME ZONE $1, 'YYYY-MM') AS k, sum(amount_cents - refunded_cents)::int AS cents
       FROM payments WHERE status IN ('paid','refunded') AND paid_at > now() - interval '13 months' GROUP BY 1`,
      [TZ],
    ),
    one<{ currency: string }>(`SELECT currency FROM payments GROUP BY currency ORDER BY count(*) DESC LIMIT 1`),
  ]);
  const nowLocal = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const stripeMrr = subs?.mrr ?? 0;
  const manualMrr = manual?.mrr ?? 0;
  return {
    stripeMrr,
    manualMrr,
    mrr: stripeMrr + manualMrr,
    activeSubs: subs?.n ?? 0,
    pastDue: subs?.past_due ?? 0,
    cashThisMonth: month?.this_month ?? 0,
    cashLastMonthToDate: month?.last_mtd ?? 0,
    failed30d: failed?.n ?? 0,
    failed30dCents: failed?.cents ?? 0,
    series: monthSeries(new Map(monthly.map((m) => [m.k, m.cents])), new Date(Date.UTC(nowLocal.getFullYear(), nowLocal.getMonth(), 15))),
    currency: cur?.currency ?? 'usd',
  };
}

export async function listPayments(opts: { clientId?: string; limit?: number; status?: string } = {}): Promise<Payment[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts.clientId) conds.push(`p.client_id = $${params.push(opts.clientId)}`);
  if (opts.status) conds.push(`p.status = $${params.push(opts.status)}`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return q<Payment>(`${PAYMENT_SELECT} ${where} ORDER BY p.paid_at DESC LIMIT ${Math.min(opts.limit ?? 100, 500)}`, params);
}

export async function listSubscriptions(opts: { clientCustomerIds?: string[]; live?: boolean } = {}): Promise<Subscription[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts.clientCustomerIds) conds.push(`s.stripe_customer_id = ANY($${params.push(opts.clientCustomerIds)}::text[])`);
  if (opts.live) conds.push(`s.status IN ('active','past_due','trialing')`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return q<Subscription>(`${SUB_SELECT} ${where} ORDER BY s.status = 'past_due' DESC, s.mrr_cents DESC`, params);
}

/** Renewals in the next `days`: Stripe subscriptions plus manual renewal dates on clients. */
export async function upcomingRenewals(days = 7): Promise<{ label: string; slug: string | null; when: string; cents: number; source: 'stripe' | 'manual'; cancelling: boolean }[]> {
  const stripe = await q<{ label: string; slug: string | null; when: string; cents: number; cancelling: boolean }>(
    `SELECT COALESCE(c.name, NULLIF(sc.name, ''), NULLIF(sc.email, ''), s.stripe_customer_id) AS label, c.slug, s.current_period_end::text AS when,
       s.mrr_cents AS cents, (s.cancel_at_period_end OR s.cancel_at IS NOT NULL) AS cancelling
     FROM subscriptions s LEFT JOIN stripe_customers sc ON sc.id = s.stripe_customer_id
     LEFT JOIN clients c ON c.stripe_customer_ids @> to_jsonb(s.stripe_customer_id)
     WHERE s.status IN ('active','past_due','trialing') AND s.current_period_end BETWEEN now() AND now() + make_interval(days => $1)`,
    [days],
  );
  const manual = await q<{ label: string; slug: string; when: string; cents: number }>(
    `SELECT name AS label, slug, renewal_date::text AS when, retainer_cents AS cents FROM clients
     WHERE status IN ('active','onboarding') AND renewal_date BETWEEN $1::date AND $1::date + $2::int`,
    [todayInTz(), days],
  );
  return [
    ...stripe.map((r) => ({ ...r, source: 'stripe' as const })),
    ...manual.map((r) => ({ ...r, source: 'manual' as const, cancelling: false })),
  ].sort((a, b) => a.when.localeCompare(b.when));
}

export async function stripeCustomers(): Promise<{ id: string; label: string; email: string; linked_to: string | null }[]> {
  return q(
    `SELECT sc.id, COALESCE(NULLIF(sc.name, ''), NULLIF(sc.email, ''), sc.id) AS label, sc.email, c.name AS linked_to
     FROM stripe_customers sc LEFT JOIN clients c ON c.stripe_customer_ids @> to_jsonb(sc.id) ORDER BY label`,
  );
}

export async function clientMonthSeries(clientId: string): Promise<MonthBucket[]> {
  const rows = await q<{ k: string; cents: number }>(
    `SELECT to_char(paid_at AT TIME ZONE $2, 'YYYY-MM') AS k, sum(amount_cents - refunded_cents)::int AS cents
     FROM payments WHERE client_id = $1 AND status IN ('paid','refunded') AND paid_at > now() - interval '13 months' GROUP BY 1`,
    [clientId, TZ],
  );
  return monthSeries(new Map(rows.map((r) => [r.k, r.cents])), new Date());
}

// ── Ads, calendar, email ───────────────────────────────────────────────────

export async function adTotals(clientId: string, days = 30): Promise<AdTotals[]> {
  return q<AdTotals>(
    `SELECT platform, sum(spend_cents)::int AS spend_cents, sum(impressions)::int AS impressions, sum(clicks)::int AS clicks,
       sum(conversions)::float AS conversions, sum(conversion_value_cents)::int AS conversion_value_cents, count(*)::int AS days
     FROM ad_metrics WHERE client_id = $1 AND day > $2::date - $3::int GROUP BY platform ORDER BY platform`,
    [clientId, todayInTz(), days],
  );
}

export async function adDaily(clientId: string, days = 30): Promise<{ day: string; spend_cents: number; conversions: number }[]> {
  return q(
    `SELECT day::text, sum(spend_cents)::int AS spend_cents, sum(conversions)::float AS conversions FROM ad_metrics
     WHERE client_id = $1 AND day > $2::date - $3::int GROUP BY day ORDER BY day`,
    [clientId, todayInTz(), days],
  );
}

export async function events(opts: { clientId?: string; todayOnly?: boolean } = {}): Promise<CalEvent[]> {
  const conds = [`e.starts_at > now() - interval '12 hours'`];
  const params: unknown[] = [];
  if (opts.todayOnly) {
    const tz = params.push(TZ);
    conds.push(`(e.starts_at AT TIME ZONE $${tz})::date = (now() AT TIME ZONE $${tz})::date`);
  }
  if (opts.clientId) conds.push(`e.client_id = $${params.push(opts.clientId)}`);
  return q<CalEvent>(
    `SELECT e.id, e.title, e.starts_at::text, e.ends_at::text, e.all_day, e.link, e.client_id, c.name AS client_name, c.slug AS client_slug
     FROM calendar_events e LEFT JOIN clients c ON c.id = e.client_id WHERE ${conds.join(' AND ')} ORDER BY e.starts_at LIMIT 25`,
    params,
  );
}

export async function clientEmails(clientId: string): Promise<Email[]> {
  return q<Email>(`SELECT id, thread_id, subject, sender, snippet, sent_at::text FROM emails WHERE client_id = $1 ORDER BY sent_at DESC LIMIT 10`, [clientId]);
}

/** Stripe customers paying a live subscription who are not on any client yet. */
export async function importableStripeCount(): Promise<number> {
  const row = await one<{ n: number }>(
    `SELECT count(DISTINCT sc.id)::int AS n FROM stripe_customers sc JOIN subscriptions s ON s.stripe_customer_id = sc.id
     WHERE s.status IN ('active','past_due','paused','trialing') AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.stripe_customer_ids @> to_jsonb(sc.id))`,
  );
  return row?.n ?? 0;
}

// ── Forecast ───────────────────────────────────────────────────────────────

export type Forecast = {
  charges: ForecastCharge[];
  next30: number;
  next60: number;
  next90: number;
  months: { key: string; label: string; cents: number }[];
  /** Monthly value of subscriptions still in a trial, with the day billing starts. */
  starting: { label: string; client_slug: string | null; monthly_cents: number; starts: string }[];
};

export async function forecast(): Promise<Forecast> {
  const subs = await q<ForecastSub & { label: string }>(
    `SELECT s.id, COALESCE(c.name, NULLIF(sc.name, ''), NULLIF(sc.email, ''), s.stripe_customer_id) AS label, c.slug AS client_slug,
       s.status, s.items, s.trial_end::text, s.cancel_at::text, s.cancel_at_period_end
     FROM subscriptions s LEFT JOIN stripe_customers sc ON sc.id = s.stripe_customer_id
     LEFT JOIN clients c ON c.stripe_customer_ids @> to_jsonb(s.stripe_customer_id)
     WHERE s.status IN ('active','past_due','trialing')`,
  );
  const manual = await q<ManualRetainer>(
    `SELECT name AS label, slug AS client_slug, retainer_cents AS cents,
       COALESCE(EXTRACT(DAY FROM renewal_date), EXTRACT(DAY FROM start_date), 1)::int AS anchor_day
     FROM clients WHERE status IN ('active','onboarding') AND retainer_cents > 0 AND jsonb_array_length(stripe_customer_ids) = 0`,
  );
  const now = new Date();
  const charges = forecastCharges(subs, manual, now, 183);
  const starting = subs
    .filter((s) => s.status === 'trialing' && s.trial_end && !s.cancel_at_period_end)
    .map((s) => ({
      label: s.label,
      client_slug: s.client_slug,
      monthly_cents: itemsMrrCents(s.items.map((i) => ({ price: { unit_amount: i.amount_cents, recurring: { interval: i.interval, interval_count: i.interval_count } } }))),
      starts: s.trial_end!,
    }));
  return {
    charges,
    next30: sumWithin(charges, now, 30),
    next60: sumWithin(charges, now, 60),
    next90: sumWithin(charges, now, 90),
    months: forecastByMonth(charges, now, 6),
    starting,
  };
}
