import 'server-only';
import { q, one, newId } from './db';
import { parseDomains, slugify } from './slug';
import { getSetting, setSetting } from './settings';
import { relinkPayments } from './integrations/stripe';
import { CLIENT_STATUSES, type ClientStatus } from './types';

export async function uniqueSlug(name: string, exceptId?: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; ; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const hit = await one<{ id: string }>(`SELECT id FROM clients WHERE slug = $1`, [slug]);
    if (!hit || hit.id === exceptId) return slug;
  }
}

/** Stripe customers the operator deleted as clients; never re-imported. */
async function ignoredCustomers(): Promise<string[]> {
  try {
    return JSON.parse((await getSetting('stripe.ignored_customers')) ?? '[]');
  } catch {
    return [];
  }
}

export async function ignoreCustomers(ids: string[]) {
  if (!ids.length) return;
  const cur = new Set(await ignoredCustomers());
  ids.forEach((i) => cur.add(i));
  await setSetting('stripe.ignored_customers', JSON.stringify([...cur]));
}

/**
 * Every Stripe customer with a live subscription (active, past due, paused, or
 * a trial that has not started billing) becomes a client, already linked.
 * Trials come in as "onboarding". Runs after each Stripe sync; idempotent.
 */
export async function importStripeClients(): Promise<number> {
  const ignored = await ignoredCustomers();
  const rows = await q<{ id: string; name: string; email: string; trial_only: boolean }>(
    `SELECT sc.id, sc.name, sc.email, bool_and(s.status = 'trialing') AS trial_only
     FROM stripe_customers sc JOIN subscriptions s ON s.stripe_customer_id = sc.id
     WHERE s.status IN ('active','past_due','paused','trialing')
       AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.stripe_customer_ids @> to_jsonb(sc.id))
       AND NOT (sc.id = ANY($1::text[]))
     GROUP BY sc.id, sc.name, sc.email`,
    [ignored],
  );
  for (const r of rows) {
    const name = r.name || r.email.split('@')[0] || r.id;
    await q(
      `INSERT INTO clients (id, slug, name, status, contact_email, email_domains, stripe_customer_ids, start_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT min(paid_at)::date FROM payments WHERE stripe_customer_id = $8 AND status = 'paid'))`,
      [newId('cli'), await uniqueSlug(name), name, r.trial_only ? 'onboarding' : 'active', r.email.toLowerCase(), JSON.stringify(parseDomains(r.email)), JSON.stringify([r.id]), r.id],
    );
  }
  if (rows.length) await relinkPayments();
  return rows.length;
}

export type NewClient = {
  name: string;
  status?: ClientStatus;
  retainer_cents?: number;
  start_date?: string | null;
  renewal_date?: string | null;
  contact_name?: string;
  contact_email?: string;
  website?: string;
  services?: string[];
  notes?: string;
};

/** Create a client, or update the one with the same name (case-insensitive). Returns its slug. */
export async function upsertClientByName(c: NewClient): Promise<{ slug: string; created: boolean }> {
  const status = CLIENT_STATUSES.includes(c.status as ClientStatus) ? c.status : 'active';
  const existing = await one<{ id: string; slug: string }>(`SELECT id, slug FROM clients WHERE lower(name) = lower($1)`, [c.name]);
  const date = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  if (existing) {
    await q(
      `UPDATE clients SET status = $2, retainer_cents = COALESCE($3, retainer_cents), start_date = COALESCE($4, start_date),
         renewal_date = COALESCE($5, renewal_date), notes = CASE WHEN $6 = '' THEN notes ELSE $6 END WHERE id = $1`,
      [existing.id, status, c.retainer_cents ?? null, date(c.start_date), date(c.renewal_date), c.notes ?? ''],
    );
    return { slug: existing.slug, created: false };
  }
  const slug = await uniqueSlug(c.name);
  await q(
    `INSERT INTO clients (id, slug, name, status, services, retainer_cents, start_date, renewal_date, contact_name, contact_email, website, email_domains, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      newId('cli'),
      slug,
      c.name,
      status,
      JSON.stringify(c.services ?? []),
      c.retainer_cents ?? 0,
      date(c.start_date),
      date(c.renewal_date),
      c.contact_name ?? '',
      (c.contact_email ?? '').toLowerCase(),
      c.website ?? '',
      JSON.stringify(parseDomains(`${c.website ?? ''} ${c.contact_email ?? ''}`)),
      c.notes ?? '',
    ],
  );
  return { slug, created: true };
}

/**
 * Merge clients linked to the same Stripe customers (left by the double-encoding bug).
 * Keeps the oldest, moves tasks / objectives / payments / schedules / notes onto it, deletes the rest.
 */
export async function dedupeClients(): Promise<number> {
  const groups = await q<{ ids: string[] }>(
    `SELECT array_agg(id ORDER BY created_at, id) AS ids FROM clients
     WHERE jsonb_typeof(stripe_customer_ids) = 'array' AND jsonb_array_length(stripe_customer_ids) > 0
     GROUP BY stripe_customer_ids HAVING count(*) > 1`,
  );
  let removed = 0;
  for (const g of groups) {
    const [keep, ...drop] = g.ids;
    for (const table of ['tasks', 'recurring_tasks', 'objectives', 'payments', 'recurring_payments', 'calendar_events']) {
      await q(`UPDATE ${table} SET client_id = $1 WHERE client_id = ANY($2::text[])`, [keep, drop]);
    }
    await q(
      `UPDATE clients k SET notes = trim(both E'\\n' from k.notes || E'\\n' || coalesce((SELECT string_agg(notes, E'\\n') FROM clients WHERE id = ANY($2::text[]) AND notes <> ''), ''))
       WHERE k.id = $1`,
      [keep, drop],
    );
    await q(`DELETE FROM clients WHERE id = ANY($1::text[])`, [drop]);
    removed += drop.length;
  }
  return removed;
}
