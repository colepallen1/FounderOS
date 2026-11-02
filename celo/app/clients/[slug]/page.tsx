import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BarChart } from '@/components/BarChart';
import { ClientFields } from '@/components/ClientFields';
import { Icon } from '@/components/Icon';
import { Kanban } from '@/components/Kanban';
import { NotesEditor } from '@/components/NotesEditor';
import { Objectives } from '@/components/Objectives';
import { ManualPaymentForm, PaymentsTable } from '@/components/Payments';
import { RecurringManager } from '@/components/Recurring';
import { TaskChecklist } from '@/components/TaskChecklist';
import { Badge, Empty, NotConfigured, PageHeader, Panel, STATUS_TONE, Stat, Tabs } from '@/components/ui';
import { fmtAgo, fmtDate, fmtNum, fmtTime } from '@/components/format';
import { deleteClient, setStripeLinks, updateClient } from '@/lib/actions';
import { formatMoney } from '@/lib/money';
import {
  adDaily,
  adTotals,
  clientEmails,
  clientMonthSeries,
  clientOptions,
  events,
  getClientBySlug,
  listObjectives,
  listPayments,
  listRecurring,
  listSubscriptions,
  listTasks,
  stripeCustomers,
  todayInTz,
  type ClientSummary,
} from '@/lib/queries';
import { configured } from '@/lib/sync';
import type { AdTotals } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const c = await getClientBySlug(params.slug);
  return { title: c?.name ?? 'Client' };
}

const TAB_IDS = ['overview', 'work', 'revenue', 'ads', 'comms', 'settings'] as const;
type Tab = (typeof TAB_IDS)[number];

export default async function ClientPage({ params, searchParams }: { params: { slug: string }; searchParams: { tab?: string } }) {
  const c = await getClientBySlug(params.slug);
  if (!c) notFound();
  const tab: Tab = (TAB_IDS as readonly string[]).includes(searchParams.tab ?? '') ? (searchParams.tab as Tab) : 'overview';
  const [tasks, conn] = await Promise.all([listTasks(c.id), configured()]);
  const open = tasks.filter((t) => t.status !== 'done');
  const base = `/clients/${c.slug}`;
  const fixed = { id: c.id, slug: c.slug };

  return (
    <>
      <div className="mb-2 text-[12px]">
        <Link href="/clients" className="text-faint hover:text-muted">
          Clients
        </Link>
      </div>
      <PageHeader
        eyebrow={[c.services.join(' · ') || 'Client', c.start_date ? `since ${fmtDate(c.start_date, { month: 'short', year: 'numeric' })}` : ''].filter(Boolean).join(' · ')}
        title={c.name}
      >
        <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
        {c.past_due && <Badge tone="bad" icon="alert">Payment past due</Badge>}
        {c.website && (
          <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="btn-ghost">
            <Icon name="globe" size={14} /> Site
          </a>
        )}
        {c.contact_email && (
          <a href={`mailto:${c.contact_email}`} className="btn-ghost">
            <Icon name="mail" size={14} /> Email
          </a>
        )}
      </PageHeader>

      <Tabs
        base={base}
        current={tab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'work', label: 'Work', count: open.length },
          { id: 'revenue', label: 'Revenue' },
          { id: 'ads', label: 'Ads' },
          { id: 'comms', label: 'Comms' },
          { id: 'settings', label: 'Settings' },
        ]}
      />

      {tab === 'overview' && <Overview c={c} open={open} conn={conn} />}
      {tab === 'work' && <WorkTab c={c} tasks={tasks} fixed={fixed} />}
      {tab === 'revenue' && <RevenueTab c={c} fixed={fixed} stripeOn={conn.stripe} />}
      {tab === 'ads' && <AdsTab c={c} conn={conn} />}
      {tab === 'comms' && <CommsTab c={c} conn={conn} />}
      {tab === 'settings' && <SettingsTab c={c} stripeOn={conn.stripe} />}
    </>
  );
}

type Conn = Awaited<ReturnType<typeof configured>>;

async function Overview({ c, open, conn }: { c: ClientSummary; open: Awaited<ReturnType<typeof listTasks>>; conn: Conn }) {
  const today = todayInTz();
  const [objectives, ads, upcoming, mail] = await Promise.all([listObjectives(c.id), adTotals(c.id), events({ clientId: c.id }), clientEmails(c.id)]);
  const spend = ads.reduce((s, a) => s + a.spend_cents, 0);
  const value = ads.reduce((s, a) => s + a.conversion_value_cents, 0);
  const conv = ads.reduce((s, a) => s + a.conversions, 0);
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
  const sorted = [...open].sort((a, b) => a.priority - b.priority || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Monthly recurring" value={c.mrr_cents ? formatMoney(c.mrr_cents) : '-'} sub={c.mrr_source === 'stripe' ? 'From Stripe' : c.mrr_source === 'manual' ? 'Manual retainer' : 'No retainer set'} href={`/clients/${c.slug}?tab=revenue`} />
        <Stat label="Lifetime value" value={c.ltv_cents ? formatMoney(c.ltv_cents, 'usd', { compact: true }) : '-'} sub={c.last_paid_at ? `Last paid ${fmtDate(c.last_paid_at)}` : 'No payments yet'} href={`/clients/${c.slug}?tab=revenue`} />
        <Stat label="Open tasks" value={open.length} tone={overdue ? 'bad' : undefined} sub={overdue ? `${overdue} overdue` : 'Nothing overdue'} href={`/clients/${c.slug}?tab=work`} />
        <Stat
          label="Ad spend · 30d"
          value={spend ? formatMoney(spend, 'usd', { compact: true }) : '-'}
          sub={spend ? (value ? `${(value / spend).toFixed(2)}x ROAS` : conv ? `${fmtNum(conv)} conversions · ${formatMoney(Math.round(spend / conv))} each` : 'No conversions tracked') : c.meta_ad_account_id || c.google_ads_customer_id ? 'Waiting for first sync' : 'No ad account linked'}
          href={`/clients/${c.slug}?tab=ads`}
        />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Objectives" icon="target" className="xl:col-span-2">
          <Objectives items={objectives} clientId={c.id} clientSlug={c.slug} />
        </Panel>
        <Panel
          title="To do"
          icon="check"
          action={
            <Link href={`/clients/${c.slug}?tab=work`} className="link text-[12px]">
              Board
            </Link>
          }
        >
          {sorted.length ? <TaskChecklist tasks={sorted.slice(0, 8)} today={today} showClient={false} /> : <Empty>All clear.</Empty>}
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Notes" icon="note" className="xl:col-span-2">
          <NotesEditor clientId={c.id} initial={c.notes} />
        </Panel>
        <Panel title="Next up" icon="calendar">
          {!conn.calendar ? (
            <NotConfigured what="Google" href="/settings#google" />
          ) : upcoming.length || mail.length ? (
            <ul className="space-y-3">
              {upcoming.slice(0, 3).map((e) => (
                <li key={e.id} className="flex gap-3">
                  <Icon name="calendar" size={14} className="mt-1 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px]">{e.title}</div>
                    <div className="text-[11.5px] text-faint">
                      {fmtDate(e.starts_at, { weekday: 'short', month: 'short', day: 'numeric' })} {!e.all_day && fmtTime(e.starts_at)}
                    </div>
                  </div>
                </li>
              ))}
              {mail.slice(0, 3).map((m) => (
                <li key={m.id} className="flex gap-3">
                  <Icon name="mail" size={14} className="mt-1 shrink-0 text-faint" />
                  <div className="min-w-0">
                    <a href={`https://mail.google.com/mail/u/0/#all/${m.thread_id}`} target="_blank" rel="noreferrer" className="block truncate text-[13.5px] hover:text-accent-hi">
                      {m.subject || '(no subject)'}
                    </a>
                    <div className="text-[11.5px] text-faint">{fmtAgo(m.sent_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{c.email_domains.length || c.contact_email ? 'No upcoming calls or recent email.' : 'Add email domains in Settings to match calls and email.'}</Empty>
          )}
        </Panel>
      </div>
    </>
  );
}

async function WorkTab({ c, tasks, fixed }: { c: ClientSummary; tasks: Awaited<ReturnType<typeof listTasks>>; fixed: { id: string; slug: string } }) {
  const [clients, rules] = await Promise.all([clientOptions(), listRecurring(c.id)]);
  return (
    <>
      <Kanban tasks={tasks} clients={clients} today={todayInTz()} fixedClient={fixed} />
      <Panel title="Recurring for this client" icon="repeat" className="mt-6">
        <RecurringManager rules={rules} clients={clients} fixedClient={fixed} />
      </Panel>
    </>
  );
}

async function RevenueTab({ c, fixed, stripeOn }: { c: ClientSummary; fixed: { id: string; slug: string }; stripeOn: boolean }) {
  const [series, payments, subs] = await Promise.all([
    clientMonthSeries(c.id),
    listPayments({ clientId: c.id, limit: 200 }),
    c.stripe_customer_ids.length ? listSubscriptions({ clientCustomerIds: c.stripe_customer_ids }) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-4">
      <Panel title="Collected per month" icon="money">
        {series.some((s) => s.cents > 0) ? (
          <BarChart caption={`Revenue from ${c.name} per month`} bars={series.map((m) => ({ key: m.key, label: m.label, value: m.cents, display: formatMoney(m.cents) }))} />
        ) : (
          <Empty>No payments from this client yet.</Empty>
        )}
      </Panel>
      <Panel title="Stripe subscriptions" icon="repeat" pad={!subs.length}>
        {!stripeOn ? (
          <NotConfigured what="Stripe" href="/settings#stripe" />
        ) : !c.stripe_customer_ids.length ? (
          <div className="text-sm text-muted">
            No Stripe customer linked.{' '}
            <Link href={`/clients/${c.slug}?tab=settings#stripe`} className="link">
              Link one
            </Link>{' '}
            to pull this client's subscriptions and payments.
          </div>
        ) : subs.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Renews</th>
                  <th className="text-right">MRR</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td>{s.description || s.id}</td>
                    <td>
                      <div className="flex gap-1.5">
                        <Badge tone={STATUS_TONE[s.status] ?? 'muted'}>{s.status.replace('_', ' ')}</Badge>
                        {s.cancel_at_period_end && <Badge tone="warn">Cancelling</Badge>}
                      </div>
                    </td>
                    <td className="text-muted">{fmtDate(s.current_period_end)}</td>
                    <td className="num text-right text-[15px]">{formatMoney(s.mrr_cents, s.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No subscriptions on the linked customer.</Empty>
        )}
      </Panel>
      <Panel title="Log an off-Stripe payment" icon="plus">
        <ManualPaymentForm clients={[]} fixedClient={fixed} />
      </Panel>
      <Panel title="Payment history" icon="money" pad={false}>
        <div className={payments.length ? '' : 'p-5'}>
          <PaymentsTable payments={payments} showClient={false} />
        </div>
      </Panel>
    </div>
  );
}

function AdBlock({ a, label }: { a: AdTotals | undefined; label: string }) {
  if (!a) return null;
  const ctr = a.impressions ? (a.clicks / a.impressions) * 100 : 0;
  const cpa = a.conversions ? a.spend_cents / a.conversions : 0;
  const roas = a.spend_cents ? a.conversion_value_cents / a.spend_cents : 0;
  return (
    <Panel title={`${label} · last 30 days`} icon="ads">
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Spend', formatMoney(a.spend_cents)],
          ['Impressions', fmtNum(a.impressions)],
          ['CTR', `${ctr.toFixed(2)}%`],
          ['Conversions', fmtNum(a.conversions, 1)],
          ['Cost / conv.', cpa ? formatMoney(Math.round(cpa)) : '-'],
          ['ROAS', roas ? `${roas.toFixed(2)}x` : '-'],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="eyebrow">{k}</dt>
            <dd className="num mt-1.5 text-[24px]">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

async function AdsTab({ c, conn }: { c: ClientSummary; conn: Conn }) {
  const [totals, daily, runs] = await Promise.all([adTotals(c.id), adDaily(c.id), import('@/lib/sync').then((m) => m.syncRuns())]);
  const meta = totals.find((t) => t.platform === 'meta');
  const google = totals.find((t) => t.platform === 'google');
  const linked = c.meta_ad_account_id || c.google_ads_customer_id;
  const settings = `/clients/${c.slug}?tab=settings`;
  return (
    <div className="space-y-4">
      {!linked && (
        <Panel>
          <div className="text-sm text-muted">
            No ad accounts linked to {c.name}.{' '}
            <Link href={settings} className="link">
              Add a Meta ad account or Google Ads customer ID
            </Link>
            .
          </div>
        </Panel>
      )}
      {c.meta_ad_account_id && !conn.meta && (
        <Panel>
          <NotConfigured what="Meta Ads" href="/settings#meta" />
        </Panel>
      )}
      {c.google_ads_customer_id && !conn.google_ads && (
        <Panel>
          <NotConfigured what="Google Ads" href="/settings#google" />
        </Panel>
      )}
      {linked && daily.length > 0 && (
        <Panel title="Daily ad spend · all platforms" icon="ads">
          <BarChart
            caption={`Daily ad spend for ${c.name}, last 30 days`}
            height={180}
            highlightLast={false}
            bars={daily.map((d) => ({ key: d.day, label: d.day.slice(8), value: d.spend_cents, display: `${formatMoney(d.spend_cents)} · ${fmtNum(d.conversions, 1)} conv.` }))}
          />
        </Panel>
      )}
      <AdBlock a={meta} label="Meta Ads" />
      <AdBlock a={google} label="Google Ads" />
      {linked && !totals.length && (conn.meta || conn.google_ads) && (
        <Panel>
          <Empty>
            No ad data yet. Last sync: Meta {fmtAgo(runs.get('meta')?.last_ok_at)}, Google Ads {fmtAgo(runs.get('google_ads')?.last_ok_at)}.
            {runs.get('meta')?.ok === false && <span className="mt-2 block text-bad">{runs.get('meta')?.message}</span>}
            {runs.get('google_ads')?.ok === false && <span className="mt-2 block text-bad">{runs.get('google_ads')?.message}</span>}
          </Empty>
        </Panel>
      )}
    </div>
  );
}

async function CommsTab({ c, conn }: { c: ClientSummary; conn: Conn }) {
  if (!conn.gmail) {
    return (
      <Panel>
        <NotConfigured what="Gmail and Google Calendar" href="/settings#google" />
      </Panel>
    );
  }
  const [mail, upcoming] = await Promise.all([clientEmails(c.id), events({ clientId: c.id })]);
  const noMatch = !c.email_domains.length && !c.contact_email;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Recent email · 30 days" icon="mail" className="xl:col-span-2">
        {noMatch ? (
          <div className="text-sm text-muted">
            Add this client's email domains in{' '}
            <Link href={`/clients/${c.slug}?tab=settings`} className="link">
              Settings
            </Link>{' '}
            to match their email.
          </div>
        ) : mail.length ? (
          <ul className="divide-y divide-line/60">
            {mail.map((m) => (
              <li key={m.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <a href={`https://mail.google.com/mail/u/0/#all/${m.thread_id}`} target="_blank" rel="noreferrer" className="truncate text-[14px] hover:text-accent-hi">
                    {m.subject || '(no subject)'}
                  </a>
                  <span className="shrink-0 text-[11.5px] text-faint">{fmtAgo(m.sent_at)}</span>
                </div>
                <div className="truncate text-[12px] text-muted">{m.sender}</div>
                <div className="mt-1 line-clamp-2 text-[12.5px] text-faint">{m.snippet}</div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No email with {c.email_domains.join(', ') || c.contact_email} in the last 30 days.</Empty>
        )}
      </Panel>
      <Panel title="Upcoming calls" icon="calendar">
        {upcoming.length ? (
          <ul className="divide-y divide-line/60">
            {upcoming.map((e) => (
              <li key={e.id} className="py-2.5">
                <div className="text-[14px]">{e.title}</div>
                <div className="flex gap-3 text-[11.5px] text-faint">
                  <span>
                    {fmtDate(e.starts_at, { weekday: 'short', month: 'short', day: 'numeric' })} {!e.all_day && fmtTime(e.starts_at)}
                  </span>
                  {e.link && (
                    <a href={e.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-muted">
                      Join <Icon name="external" size={11} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No calls with this client in the next two weeks.</Empty>
        )}
      </Panel>
    </div>
  );
}

async function SettingsTab({ c, stripeOn }: { c: ClientSummary; stripeOn: boolean }) {
  const customers = stripeOn ? await stripeCustomers() : [];
  const linked = new Set(c.stripe_customer_ids);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Profile & connections" icon="settings" className="xl:col-span-2">
        <form action={updateClient} className="space-y-6">
          <input type="hidden" name="id" value={c.id} />
          <ClientFields c={c} full />
          <button className="btn">Save changes</button>
        </form>
      </Panel>
      <div className="space-y-4">
        <Panel title="Stripe customers" icon="money">
          <div id="stripe" />
          {!stripeOn ? (
            <NotConfigured what="Stripe" href="/settings#stripe" />
          ) : customers.length ? (
            <form action={setStripeLinks} className="space-y-3">
              <input type="hidden" name="id" value={c.id} />
              <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {[...customers].sort((a, b) => Number(linked.has(b.id)) - Number(linked.has(a.id))).map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-start gap-2.5 px-2 py-1.5 text-[13px] hover:bg-ink/[0.03]">
                    <input type="checkbox" name="stripe_customer_ids" value={s.id} defaultChecked={linked.has(s.id)} className="mt-0.5 accent-[rgb(var(--accent))]" />
                    <span className="min-w-0">
                      <span className="block truncate">{s.label}</span>
                      <span className="block truncate text-[11px] text-faint">
                        {s.email || s.id}
                        {s.linked_to && s.linked_to !== c.name && ` · linked to ${s.linked_to}`}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <button className="btn">Save links</button>
            </form>
          ) : (
            <Empty>No Stripe customers synced yet.</Empty>
          )}
        </Panel>
        <Panel title="Danger zone" icon="alert">
          <form action={deleteClient} className="space-y-3">
            <input type="hidden" name="id" value={c.id} />
            <p className="text-[12.5px] text-muted">Deletes this client with its tasks, objectives and ad data. Payments stay, unlinked. Type DELETE to confirm.</p>
            <input name="confirm" placeholder="DELETE" className="field" autoComplete="off" />
            <button className="btn-danger">
              <Icon name="trash" size={13} /> Delete client
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
