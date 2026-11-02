import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getSecret } from '@/lib/settings';
import { q } from '@/lib/db';
import { relinkPayments, stripeClient, upsertCharge, upsertCustomer, upsertSubscription } from '@/lib/integrations/stripe';

export const dynamic = 'force-dynamic';

/** Real-time Stripe updates. Point a Stripe webhook at /api/webhooks/stripe. */
export async function POST(req: Request) {
  const [stripe, whsec] = await Promise.all([stripeClient(), getSecret('stripe.webhook_secret')]);
  if (!stripe || !whsec) return NextResponse.json({ error: 'not configured' }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), req.headers.get('stripe-signature') ?? '', whsec);
  } catch {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }

  const obj = event.data.object as { object?: string; id?: string };
  switch (obj.object) {
    case 'charge':
      await upsertCharge(obj as Stripe.Charge);
      break;
    case 'subscription':
      await upsertSubscription(await stripe.subscriptions.retrieve(obj.id!));
      break;
    case 'customer':
      if (event.type === 'customer.deleted') await q(`DELETE FROM stripe_customers WHERE id = $1`, [obj.id]);
      else await upsertCustomer(obj as Stripe.Customer);
      break;
    case 'invoice': {
      // Invoices carry no money of their own here; refresh the subscription they belong to.
      const inv = obj as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } };
      const sub = inv.parent?.subscription_details?.subscription;
      const subId = typeof sub === 'string' ? sub : sub?.id;
      if (subId) await upsertSubscription(await stripe.subscriptions.retrieve(subId));
      break;
    }
    case 'refund': {
      const r = obj as Stripe.Refund;
      const ch = typeof r.charge === 'string' ? r.charge : r.charge?.id;
      if (ch) await upsertCharge(await stripe.charges.retrieve(ch));
      break;
    }
  }
  await relinkPayments();
  await q(`INSERT INTO sync_runs (source, last_ok_at, ok, message) VALUES ('stripe_webhook', now(), true, $1)
           ON CONFLICT (source) DO UPDATE SET last_ok_at = now(), ok = true, message = EXCLUDED.message`, [event.type]);
  return NextResponse.json({ received: true });
}
