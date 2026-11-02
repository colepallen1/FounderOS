'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { q, one, newId } from './db';
import { THEME_COOKIE } from './config';
import { parseAmountToCents } from './money';
import { parseDomains, slugify } from './slug';
import { setSecret, setSetting, SECRET_KEYS, type SecretKey } from './settings';
import { ensureWebhook, relinkPayments } from './integrations/stripe';
import { ignoreCustomers, importStripeClients as importClientsFromStripe, uniqueSlug } from './clients';
import { materializeRecurring, materializeRecurringPayments, runSync, type SourceId } from './sync';
import { PAY_CADENCES } from './recurring';
import { CLIENT_STATUSES, TASK_STATUS_IDS } from './types';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const dateOrNull = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function refresh(slug?: string | null) {
  revalidatePath('/', 'layout');
  if (slug) revalidatePath(`/clients/${slug}`);
}

// ── Clients ────────────────────────────────────────────────────────────────


export async function createClient(form: FormData) {
  const name = str(form, 'name');
  if (!name) return;
  const id = newId('cli');
  const slug = await uniqueSlug(name);
  await q(
    `INSERT INTO clients (id, slug, name, status, services, retainer_cents, start_date, contact_name, contact_email, website, email_domains)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      slug,
      name,
      z.enum(CLIENT_STATUSES).catch('onboarding').parse(str(form, 'status')),
      JSON.stringify(form.getAll('services').map(String)),
      parseAmountToCents(str(form, 'retainer')) ?? 0,
      dateOrNull(str(form, 'start_date')),
      str(form, 'contact_name'),
      str(form, 'contact_email').toLowerCase(),
      str(form, 'website'),
      JSON.stringify(parseDomains(`${str(form, 'website')} ${str(form, 'contact_email')}`)),
    ],
  );
  refresh();
  redirect(`/clients/${slug}`);
}

export async function updateClient(form: FormData) {
  const id = str(form, 'id');
  const current = await one<{ slug: string; name: string }>(`SELECT slug, name FROM clients WHERE id = $1`, [id]);
  if (!current) return;
  const name = str(form, 'name') || current.name;
  const slug = name === current.name ? current.slug : await uniqueSlug(name, id);
  await q(
    `UPDATE clients SET name=$2, slug=$3, status=$4, services=$5, retainer_cents=$6, start_date=$7, renewal_date=$8, contact_name=$9,
       contact_email=$10, website=$11, email_domains=$12, meta_ad_account_id=$13, google_ads_customer_id=$14 WHERE id=$1`,
    [
      id,
      name,
      slug,
      z.enum(CLIENT_STATUSES).catch('active').parse(str(form, 'status')),
      JSON.stringify(form.getAll('services').map(String)),
      parseAmountToCents(str(form, 'retainer')) ?? 0,
      dateOrNull(str(form, 'start_date')),
      dateOrNull(str(form, 'renewal_date')),
      str(form, 'contact_name'),
      str(form, 'contact_email').toLowerCase(),
      str(form, 'website'),
      JSON.stringify(parseDomains(str(form, 'email_domains'))),
      str(form, 'meta_ad_account_id').replace(/^act_/, ''),
      str(form, 'google_ads_customer_id').replace(/[^\d]/g, ''),
    ],
  );
  refresh(slug);
  if (slug !== current.slug) redirect(`/clients/${slug}?tab=settings`);
}

export async function saveClientNotes(id: string, notes: string) {
  await q(`UPDATE clients SET notes = $2 WHERE id = $1`, [id, notes.slice(0, 50000)]);
}

export async function setStripeLinks(form: FormData) {
  const id = str(form, 'id');
  const ids = [...new Set(form.getAll('stripe_customer_ids').map(String).filter((s) => s.startsWith('cus_')))];
  // A Stripe customer belongs to one client: take it away from anyone else first.
  for (const cus of ids) {
    await q(`UPDATE clients SET stripe_customer_ids = stripe_customer_ids - $1 WHERE id <> $2`, [cus, id]);
  }
  await q(`UPDATE clients SET stripe_customer_ids = $2 WHERE id = $1`, [id, JSON.stringify(ids)]);
  await relinkPayments();
  const c = await one<{ slug: string }>(`SELECT slug FROM clients WHERE id = $1`, [id]);
  refresh(c?.slug);
}

export async function importStripeClients() {
  const n = await importClientsFromStripe();
  refresh();
  return n;
}

export async function deleteClient(form: FormData) {
  const id = str(form, 'id');
  if (str(form, 'confirm') !== 'DELETE') return;
  // Remember its Stripe customers so the next sync does not bring the client back.
  const c = await one<{ ids: string[] }>(`SELECT stripe_customer_ids AS ids FROM clients WHERE id = $1`, [id]);
  await ignoreCustomers(c?.ids ?? []);
  await q(`DELETE FROM clients WHERE id = $1`, [id]);
  refresh();
  redirect('/clients');
}

// ── Tasks ──────────────────────────────────────────────────────────────────

const TaskStatus = z.enum(TASK_STATUS_IDS as [string, ...string[]]);

export async function createTask(form: FormData) {
  const title = str(form, 'title');
  if (!title) return;
  const status = TaskStatus.catch('backlog').parse(str(form, 'status'));
  await q(`INSERT INTO tasks (id, client_id, title, notes, status, priority, due_date, position, completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
    newId('tsk'),
    str(form, 'client_id') || null,
    title.slice(0, 300),
    str(form, 'notes'),
    status,
    z.coerce.number().int().min(1).max(3).catch(2).parse(str(form, 'priority')),
    dateOrNull(str(form, 'due_date')),
    Date.now(),
    status === 'done' ? new Date().toISOString() : null,
  ]);
  refresh(str(form, 'client_slug'));
}

export async function updateTask(form: FormData) {
  const id = str(form, 'id');
  const status = TaskStatus.catch('backlog').parse(str(form, 'status'));
  await q(
    `UPDATE tasks SET title=$2, notes=$3, status=$4, priority=$5, due_date=$6, client_id=$7,
       completed_at = CASE WHEN $4 = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END WHERE id=$1`,
    [
      id,
      str(form, 'title').slice(0, 300) || 'Untitled',
      str(form, 'notes'),
      status,
      z.coerce.number().int().min(1).max(3).catch(2).parse(str(form, 'priority')),
      dateOrNull(str(form, 'due_date')),
      str(form, 'client_id') || null,
    ],
  );
  refresh(str(form, 'client_slug'));
}

/** Drag-and-drop: set column and position (a float between its new neighbours). */
export async function moveTask(id: string, status: string, position: number) {
  const s = TaskStatus.parse(status);
  await q(
    `UPDATE tasks SET status=$2, position=$3, completed_at = CASE WHEN $2 = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END WHERE id=$1`,
    [id, s, position],
  );
  revalidatePath('/', 'layout');
}

export async function toggleTaskDone(id: string, done: boolean) {
  await q(`UPDATE tasks SET status = $2, completed_at = $3 WHERE id = $1`, [id, done ? 'done' : 'week', done ? new Date().toISOString() : null]);
  revalidatePath('/', 'layout');
}

export async function deleteTask(id: string) {
  await q(`DELETE FROM tasks WHERE id = $1`, [id]);
  revalidatePath('/', 'layout');
}

export async function createRecurring(form: FormData) {
  const title = str(form, 'title');
  const cadence = z.enum(['weekly', 'monthly']).catch('weekly').parse(str(form, 'cadence'));
  const anchor = z.coerce.number().int().min(cadence === 'weekly' ? 0 : 1).max(cadence === 'weekly' ? 6 : 31).safeParse(str(form, cadence === 'weekly' ? 'weekday' : 'monthday'));
  if (!title || !anchor.success) return;
  await q(`INSERT INTO recurring_tasks (id, client_id, title, cadence, anchor, priority) VALUES ($1,$2,$3,$4,$5,$6)`, [
    newId('rec'),
    str(form, 'client_id') || null,
    title.slice(0, 300),
    cadence,
    anchor.data,
    z.coerce.number().int().min(1).max(3).catch(2).parse(str(form, 'priority')),
  ]);
  await materializeRecurring();
  refresh(str(form, 'client_slug'));
}

export async function setRecurringActive(id: string, active: boolean) {
  await q(`UPDATE recurring_tasks SET active = $2 WHERE id = $1`, [id, active]);
  revalidatePath('/', 'layout');
}

export async function deleteRecurring(id: string) {
  await q(`DELETE FROM recurring_tasks WHERE id = $1`, [id]);
  revalidatePath('/', 'layout');
}

// ── Objectives ─────────────────────────────────────────────────────────────

export async function createObjective(form: FormData) {
  const title = str(form, 'title');
  if (!title) return;
  await q(`INSERT INTO objectives (id, client_id, title, target, progress, due_date) VALUES ($1,$2,$3,$4,$5,$6)`, [
    newId('obj'),
    str(form, 'client_id'),
    title.slice(0, 300),
    str(form, 'target'),
    0,
    dateOrNull(str(form, 'due_date')),
  ]);
  refresh(str(form, 'client_slug'));
}

export async function setObjectiveProgress(id: string, progress: number) {
  await q(`UPDATE objectives SET progress = $2 WHERE id = $1`, [id, Math.max(0, Math.min(100, Math.round(progress)))]);
  revalidatePath('/', 'layout');
}

export async function deleteObjective(id: string) {
  await q(`DELETE FROM objectives WHERE id = $1`, [id]);
  revalidatePath('/', 'layout');
}

// ── Manual payments ────────────────────────────────────────────────────────

export async function addManualPayment(form: FormData) {
  const cents = parseAmountToCents(str(form, 'amount'));
  const date = dateOrNull(str(form, 'paid_at'));
  if (!cents || !date) return;
  const clientId = str(form, 'client_id') || null;
  const currency = (str(form, 'currency') || 'usd').toLowerCase();
  const repeats = str(form, 'repeats');
  const cadence = PAY_CADENCES[repeats];
  if (!cadence) {
    await q(
      `INSERT INTO payments (id, source, client_id, amount_cents, currency, status, method, description, paid_at)
       VALUES ($1,'manual',$2,$3,$4,'paid',$5,$6,$7)`,
      [newId('man'), clientId, cents, currency, str(form, 'method'), str(form, 'description'), `${date}T12:00:00Z`],
    );
  } else {
    // A schedule: the first date logs now if it has come, later ones log themselves on the day.
    await q(
      `INSERT INTO recurring_payments (id, client_id, amount_cents, currency, interval, interval_count, next_date, method, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [newId('rpy'), clientId, cents, currency, cadence.interval, cadence.interval_count, date, str(form, 'method'), str(form, 'description')],
    );
    // Keep the client's monthly retainer in step, so MRR and the forecast count it once.
    if (clientId) {
      await q(`UPDATE clients SET retainer_cents = $2 WHERE id = $1 AND jsonb_array_length(stripe_customer_ids) = 0`, [clientId, Math.round(cents * cadence.perMonth)]);
    }
    await materializeRecurringPayments();
  }
  refresh(str(form, 'client_slug'));
}

export async function setRecurringPaymentActive(id: string, active: boolean) {
  await q(`UPDATE recurring_payments SET active = $2 WHERE id = $1`, [id, active]);
  revalidatePath('/', 'layout');
}

export async function deleteRecurringPayment(id: string) {
  await q(`DELETE FROM recurring_payments WHERE id = $1`, [id]);
  revalidatePath('/', 'layout');
}

export async function deleteManualPayment(id: string) {
  await q(`DELETE FROM payments WHERE id = $1 AND source = 'manual'`, [id]);
  revalidatePath('/', 'layout');
}

// ── Integrations, theme, sync ──────────────────────────────────────────────

export async function saveSecrets(form: FormData) {
  const saved: string[] = [];
  for (const key of Object.keys(SECRET_KEYS) as SecretKey[]) {
    if (key === 'google.refresh_token') continue; // only set by the OAuth callback
    if (!form.has(key)) continue;
    const v = str(form, key);
    if (v) {
      await setSecret(key, v);
      saved.push(key);
    }
  }
  // New Stripe key and no hand-pasted webhook secret: set up the webhook, then pull everything.
  if (saved.includes('stripe.secret_key') && !saved.includes('stripe.webhook_secret')) {
    const h = headers();
    const origin = process.env.CELO_PUBLIC_URL?.replace(/\/$/, '') || `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
    await setSetting('stripe.webhook_status', await ensureWebhook(origin));
    await runSync(['stripe']);
  }
  revalidatePath('/', 'layout');
}

export async function clearSecret(key: SecretKey) {
  await setSecret(key, null);
  if (key === 'google.refresh_token') await setSetting('google.email', '');
  revalidatePath('/', 'layout');
}

export async function setTheme(theme: 'penthouse' | 'cave') {
  cookies().set(THEME_COOKIE, theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
}

export async function syncNow(only?: SourceId[]) {
  const result = await runSync(only);
  revalidatePath('/', 'layout');
  return result;
}
