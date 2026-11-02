import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dedupeClients, importStripeClients, upsertClientByName } from '@/lib/clients';
import { runSync } from '@/lib/sync';
import { q } from '@/lib/db';
import { CLIENT_STATUSES } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Operator / assistant maintenance, authorised with "Authorization: Bearer $CRON_SECRET".
 * Only touches dashboard records (clients, sync), never money or connected accounts.
 */
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync') }),
  z.object({ action: z.literal('import_stripe_clients') }),
  z.object({ action: z.literal('dedupe_clients') }),
  z.object({ action: z.literal('list_clients') }),
  z.object({
    action: z.literal('upsert_client'),
    name: z.string().min(1).max(200),
    status: z.enum(CLIENT_STATUSES).optional(),
    retainer_cents: z.number().int().min(0).max(100_000_000).optional(),
    start_date: z.string().optional(),
    renewal_date: z.string().optional(),
    contact_name: z.string().max(200).optional(),
    contact_email: z.string().max(200).optional(),
    website: z.string().max(200).optional(),
    services: z.array(z.string().max(60)).max(10).optional(),
    notes: z.string().max(5000).optional(),
  }),
]);

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join('; ') }, { status: 400 });
  try {
    const b = parsed.data;
    let result: unknown;
    if (b.action === 'sync') result = await runSync();
    else if (b.action === 'import_stripe_clients') result = { imported: await importStripeClients() };
    else if (b.action === 'dedupe_clients') result = { removed: await dedupeClients() };
    else if (b.action === 'list_clients') {
      result = await q(
        `SELECT name, status, retainer_cents, jsonb_typeof(stripe_customer_ids) AS ids_type, stripe_customer_ids FROM clients ORDER BY name`,
      );
    }
    else {
      const { action: _a, ...client } = b;
      result = await upsertClientByName(client);
    }
    revalidatePath('/', 'layout');
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
