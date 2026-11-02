import Link from 'next/link';
import { BarChart } from '@/components/BarChart';
import { Icon } from '@/components/Icon';
import { TaskChecklist } from '@/components/TaskChecklist';
import { Badge, Empty, NotConfigured, PageHeader, Panel, STATUS_TONE, Stat } from '@/components/ui';
import { fmtDate, fmtTime } from '@/components/format';
import { TZ } from '@/lib/config';
import { formatMoney, pctChange } from '@/lib/money';
import { events, forecast, listClients, moneySummary, todayInTz, todaysTasks, upcomingRenewals } from '@/lib/queries';
import { configured } from '@/lib/sync';

export const dynamic = 'force-dynamic';

function greeting(): string {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }));
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default async function Command() {
  const today = todayInTz();
  const [money, work, renewals, todayEvents, clients, conn, f] = await Promise.all([
    moneySummary(),
    todaysTasks(),
    upcomingRenewals(7),
    events({ todayOnly: true }),
    listClients(),
    configured(),
    forecast(),
  ]);
  const cur = money.currency;
  const delta = pctChange(money.cashThisMonth, money.cashLastMonthToDate);
  const owner = process.env.CELO_OWNER_NAME;
  const dueNow = [...work.overdue, ...work.today];
  const activeClients = clients.filter((c) => c.status === 'active' || c.status === 'onboarding');

  return (
    <>
      <PageHeader eyebrow="Command Center" title={`${greeting()}${owner ? `, ${owner}` : ''}.`}>
        <Link href="/work?new=1" className="btn">
          <Icon name="plus" size={14} /> Task
        </Link>
        <Link href="/money?log=1" className="btn-ghost">
          <Icon name="money" size={14} /> Log payment
        </Link>
      </PageHeader>

      {/* Money */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="Monthly recurring"
          value={formatMoney(money.mrr, cur)}
          href={conn.stripe ? '/money' : '/settings#stripe'}
          sub={
            conn.stripe ? (
              <>
                {money.activeSubs} Stripe retainer{money.activeSubs === 1 ? '' : 's'}
                {money.manualMrr > 0 && <> · {formatMoney(money.manualMrr, cur)} off-Stripe</>}
                {f.starting.map((s) => (
                  <span key={s.label + s.starts} className="block text-accent-hi">
                    +{formatMoney(s.monthly_cents, cur)}/mo from {fmtDate(s.starts)}
                  </span>
                ))}
              </>
            ) : (
              <span className="text-accent-hi">{money.manualMrr ? 'Manual retainers · ' : ''}Connect Stripe</span>
            )
          }
        />
        <Stat
          label="Collected this month"
          value={formatMoney(money.cashThisMonth, cur)}
          href="/money"
          sub={
            delta == null ? (
              'Stripe + logged payments'
            ) : (
              <span className={`inline-flex items-center gap-1 ${delta >= 0 ? 'text-good' : 'text-bad'}`}>
                <Icon name={delta >= 0 ? 'arrowUp' : 'arrowDown'} size={13} strokeWidth={2} />
                {Math.abs(delta).toFixed(0)}% vs same point last month
              </span>
            )
          }
        />
        <Stat
          label="Failed · 30 days"
          value={money.failed30d}
          tone={money.failed30d > 0 || money.pastDue > 0 ? 'bad' : undefined}
          href="/money?status=failed"
          sub={money.failed30d || money.pastDue ? `${formatMoney(money.failed30dCents, cur)} failed · ${money.pastDue} past due` : 'All payments clearing'}
        />
        <Stat
          label="Expected · 30 days"
          value={formatMoney(f.next30, cur)}
          href="/money"
          sub={`${renewals.length ? `${renewals.length} renewing this week · ` : ''}${formatMoney(f.next90, cur)} over 90 days`}
          tone={renewals.some((r) => r.cancelling) ? 'warn' : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Revenue · 12 months" icon="money" className="xl:col-span-2" action={<span className="text-[11px] text-faint">Net of refunds</span>}>
          {money.series.some((m) => m.cents > 0) ? (
            <BarChart
              caption="Revenue collected per month, last 12 months"
              bars={money.series.map((m) => ({ key: m.key, label: m.label, value: m.cents, display: formatMoney(m.cents, cur) }))} currency={cur}
            />
          ) : conn.stripe ? (
            <Empty>No payments recorded yet. They appear here as Stripe syncs or as you log them.</Empty>
          ) : (
            <NotConfigured what="Stripe" href="/settings#stripe" />
          )}
        </Panel>
        <Panel title="Upcoming renewals" icon="repeat">
          {renewals.length ? (
            <ul className="divide-y divide-line/60">
              {renewals.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[14px]">{r.slug ? <Link href={`/clients/${r.slug}`} className="hover:text-accent-hi">{r.label}</Link> : r.label}</div>
                    <div className="text-[11.5px] text-faint">
                      {fmtDate(r.when, { weekday: 'short', month: 'short', day: 'numeric' })} · {r.source === 'manual' ? 'manual' : 'Stripe'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-[17px]">{formatMoney(r.cents, cur)}</div>
                    {r.cancelling && <Badge tone="warn">Cancelling</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No renewals in the next 7 days.</Empty>
          )}
        </Panel>
      </div>

      {/* Today's work */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          title={`Due now${dueNow.length ? ` · ${dueNow.length}` : ''}`}
          icon="alert"
          action={
            <Link href="/work" className="link text-[12px]">
              Board
            </Link>
          }
        >
          {dueNow.length ? <TaskChecklist tasks={dueNow} today={today} /> : <Empty>Nothing overdue or due today.</Empty>}
        </Panel>
        <Panel title={`This week${work.week.length ? ` · ${work.week.length}` : ''}`} icon="work">
          {work.week.length ? <TaskChecklist tasks={work.week.slice(0, 12)} today={today} /> : <Empty>Nothing queued for this week. Move cards into This week on the board.</Empty>}
        </Panel>
        <Panel title="Today's calls" icon="calendar">
          {!conn.calendar ? (
            <NotConfigured what="Google Calendar" href="/settings#google" />
          ) : todayEvents.length ? (
            <ul className="divide-y divide-line/60">
              {todayEvents.map((e) => (
                <li key={e.id} className="flex gap-4 py-2.5">
                  <div className="num w-16 shrink-0 pt-0.5 text-[14px] text-accent-hi">{e.all_day ? 'All day' : fmtTime(e.starts_at)}</div>
                  <div className="min-w-0">
                    <div className="truncate text-[14px]">{e.title}</div>
                    <div className="flex gap-3 text-[11.5px] text-faint">
                      {e.client_slug && (
                        <Link href={`/clients/${e.client_slug}`} className="hover:text-muted">
                          {e.client_name}
                        </Link>
                      )}
                      {e.link && (
                        <a href={e.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-muted">
                          Join <Icon name="external" size={11} />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No calls on the calendar today.</Empty>
          )}
        </Panel>
      </div>

      {/* Roster strip */}
      <Panel
        title={`Clients · ${activeClients.length} active`}
        icon="clients"
        className="mt-4"
        pad={false}
        action={
          <Link href="/clients/new" className="link text-[12px]">
            Add client
          </Link>
        }
      >
        {clients.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Status</th>
                  <th className="text-right">MRR</th>
                  <th className="text-right">Open tasks</th>
                  <th className="hidden text-right md:table-cell">Ad spend 30d</th>
                  <th className="hidden text-right md:table-cell">Last paid</th>
                </tr>
              </thead>
              <tbody>
                {clients.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clients/${c.slug}`} className="hover:text-accent-hi">
                        {c.name}
                      </Link>
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                        {c.past_due && <Badge tone="bad" icon="alert">Past due</Badge>}
                      </div>
                    </td>
                    <td className="num text-right text-[15px]">{c.mrr_cents ? formatMoney(c.mrr_cents, cur) : <span className="text-faint">-</span>}</td>
                    <td className="num text-right text-[15px]">
                      {c.open_tasks}
                      {c.overdue_tasks > 0 && <span className="ml-1.5 text-[12px] text-bad">{c.overdue_tasks} late</span>}
                    </td>
                    <td className="num hidden text-right text-[15px] md:table-cell">{c.ad_spend_30d_cents ? formatMoney(c.ad_spend_30d_cents, cur) : <span className="text-faint">-</span>}</td>
                    <td className="hidden text-right text-[13px] text-muted md:table-cell">{c.last_paid_at ? fmtDate(c.last_paid_at) : <span className="text-faint">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <Empty>
              No clients yet.{' '}
              <Link href="/clients/new" className="link">
                Add your first client
              </Link>
            </Empty>
          </div>
        )}
      </Panel>
    </>
  );
}
