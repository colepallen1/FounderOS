import 'server-only';
import Stripe from 'stripe';
import { q, one } from '../db';
import { getSecret } from '../settings';
import { countsTowardMrr, itemsMrrCents, type ItemLike } from '../money';

export async function stripeClient(): Promise<Stripe | null> {
  const key = await getSecret('stripe.secret_key');
  return key ? new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: 'celo-command' } }) : null;
}

function customerId(c: string | { id: string } | null | undefined): string | null {
  if (!c) return null;
  return typeof c === 'string' ? c : c.id;
}

/** Find which client owns a Stripe customer (via the client's linked customer ids). */
async function clientForCustomer(cus: string | null): Promise<string | null> {
  if (!cus) return null;
  const row = await one<{ id: string }>(`SELECT id FROM clients WHERE stripe_customer_ids @> $1::jsonb LIMIT 1`, [JSON.stringify([cus])]);
  return row?.id ?? null;
}

export async function upsertCustomer(c: Stripe.Customer | Stripe.DeletedCustomer) {
  if ('deleted' in c && c.deleted) return;
  const cus = c as Stripe.Customer;
  await q(
    `INSERT INTO stripe_customers (id, name, email, synced_at) VALUES ($1,$2,$3,now())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, synced_at = now()`,
    [cus.id, cus.name ?? '', cus.email ?? ''],
  );
}

export async function upsertSubscription(s: Stripe.Subscription, productNames?: Map<string, string>) {
  const items = s.items.data;
  const mrr = countsTowardMrr(s.status) ? itemsMrrCents(items as unknown as ItemLike[]) : 0;
  // Since the 2025 "basil" API the billing period lives on each item.
  const periodEnd = items.reduce<number | null>((min, it) => {
    const end = (it as unknown as { current_period_end?: number }).current_period_end ?? null;
    return end && (!min || end < min) ? end : min;
  }, null);
  const description = items
    .map((it) => {
      const prod = it.price.product;
      if (it.price.nickname) return it.price.nickname;
      if (typeof prod === 'object' && prod && 'name' in prod) return prod.name;
      return typeof prod === 'string' ? productNames?.get(prod) ?? '' : '';
    })
    .filter(Boolean)
    .join(', ');
  await q(
    `INSERT INTO subscriptions (id, stripe_customer_id, status, mrr_cents, currency, current_period_end, cancel_at_period_end, description, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     ON CONFLICT (id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id, status = EXCLUDED.status,
       mrr_cents = EXCLUDED.mrr_cents, currency = EXCLUDED.currency, current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end, description = EXCLUDED.description, synced_at = now()`,
    [
      s.id,
      customerId(s.customer),
      s.status,
      mrr,
      s.currency,
      periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      Boolean(s.cancel_at_period_end || s.cancel_at),
      description,
    ],
  );
}

export async function upsertCharge(c: Stripe.Charge) {
  if (c.status === 'pending' && !c.paid) return;
  const cus = customerId(c.customer);
  const status = c.status === 'failed' ? 'failed' : c.refunded ? 'refunded' : c.status === 'succeeded' ? 'paid' : 'pending';
  await q(
    `INSERT INTO payments (id, source, client_id, stripe_customer_id, amount_cents, refunded_cents, currency, status, method, description, failure_message, paid_at)
     VALUES ($1,'stripe',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET client_id = COALESCE(EXCLUDED.client_id, payments.client_id), stripe_customer_id = EXCLUDED.stripe_customer_id,
       amount_cents = EXCLUDED.amount_cents, refunded_cents = EXCLUDED.refunded_cents, status = EXCLUDED.status,
       method = EXCLUDED.method, description = EXCLUDED.description, failure_message = EXCLUDED.failure_message`,
    [
      c.id,
      await clientForCustomer(cus),
      cus,
      c.amount,
      c.amount_refunded,
      c.currency,
      status,
      c.payment_method_details?.type ?? '',
      c.description ?? c.billing_details?.name ?? '',
      c.failure_message ?? '',
      new Date(c.created * 1000).toISOString(),
    ],
  );
}

/** Re-point Stripe payments at whichever client now owns each customer (after linking changes). */
export async function relinkPayments() {
  await q(`UPDATE payments p SET client_id = c.id FROM clients c
           WHERE p.source = 'stripe' AND p.stripe_customer_id IS NOT NULL AND c.stripe_customer_ids @> to_jsonb(p.stripe_customer_id)`);
  await q(`UPDATE payments p SET client_id = NULL WHERE p.source = 'stripe' AND p.client_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = p.client_id AND c.stripe_customer_ids @> to_jsonb(p.stripe_customer_id))`);
}

/** Full pull: customers, all subscriptions, and charges since the last run (13 months on first run). */
export async function syncStripe(): Promise<string> {
  const stripe = await stripeClient();
  if (!stripe) throw new Error('not configured');

  let customers = 0;
  for await (const c of stripe.customers.list({ limit: 100 })) {
    await upsertCustomer(c);
    customers++;
  }

  const productNames = new Map<string, string>();
  for await (const p of stripe.products.list({ limit: 100 })) productNames.set(p.id, p.name);

  let subs = 0;
  for await (const s of stripe.subscriptions.list({ limit: 100, status: 'all' })) {
    await upsertSubscription(s, productNames);
    subs++;
  }

  const last = await one<{ m: string | null }>(`SELECT max(paid_at)::text AS m FROM payments WHERE source = 'stripe'`);
  const since = last?.m
    ? Math.floor(new Date(last.m).getTime() / 1000) - 3 * 86400 // overlap catches late refunds
    : Math.floor(Date.now() / 1000) - 400 * 86400;
  let charges = 0;
  for await (const c of stripe.charges.list({ limit: 100, created: { gte: since } })) {
    await upsertCharge(c);
    charges++;
  }
  await relinkPayments();
  return `${customers} customers, ${subs} subscriptions, ${charges} charges`;
}
