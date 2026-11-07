import Link from 'next/link';
import { BarChart } from '@/components/BarChart';
import { Icon } from '@/components/Icon';
import { Badge, Empty, PageHeader, Panel } from '@/components/ui';
import { AccountPicker, RangePicker } from '@/components/ads/Pickers';
import { KpiGrid } from '@/components/ads/KpiGrid';
import { ApprovalQueue } from '@/components/ads/ApprovalQueue';
import { AlertsList, type AlertRow } from '@/components/ads/AlertsList';
import { ClaudePanel } from '@/components/ads/ClaudePanel';
import { CampaignTree, type TreeNode } from '@/components/ads/CampaignTree';
import { CreativeBoard, type CreativeRow } from '@/components/ads/CreativeBoard';
import { SyncAccountButton } from '@/components/ads/SyncAccountButton';
import { fmtAgo } from '@/components/format';
import { q } from '@/lib/db';
import { todayInTz } from '@/lib/queries';
import { getSecret } from '@/lib/settings';
import { listAccounts, listConnections, migrateLegacyToken } from '@/lib/meta/connections';
import { dailySeries, parseRange, rowsFor, structure, totalsBy, windowReach } from '@/lib/meta/data';
import { assessFatigue, compare, resultLabel, totals, windowEnding } from '@/lib/meta/analysis';
import { isReadOnly, listActions } from '@/lib/meta/actions';
import { AutoSync } from '@/components/ads/AutoSync';
import { latestReport } from '@/lib/ai/ads-analyst';

export const metadata = { title: 'Ads' };
export const dynamic = 'force-dynamic';

export default async function Ads({ searchParams }: { searchParams: { account?: string; range?: string; since?: string; until?: string } }) {
  await migrateLegacyToken().catch(() => undefined);
  const [connections, accounts] = await Promise.all([listConnections(), listAccounts()]);
  if (!connections.length) return <SetupState />;
  const linked = accounts.filter((a) => a.client_id);
  const account = accounts.find((a) => a.id === searchParams.account) ?? linked[0] ?? accounts[0];
  if (!account) {
    return (
      <>
        <PageHeader eyebrow="Meta" title="Ads" />
        <Panel>
          <Empty>
            Connected, but no ad accounts found yet.{' '}
            <Link href="/ads/connections" className="link">
              Check the connection
            </Link>
          </Empty>
        </Panel>
      </>
    );
  }

  const today = todayInTz();
  const range = parseRange(searchParams, today);
  const current = windowEnding(range.until, range.days);
  const lookback = windowEnding(range.until, range.days * 2 > 42 ? range.days * 2 : 42);
  const readOnly = await isReadOnly();
  const [rows, { campaigns, adsets, ads }, acctReach, adReach, pending, alerts, report, claudeKey] = await Promise.all([
    rowsFor([account.id], { since: lookback.start, until: range.until }),
    structure([account.id]),
    windowReach(account.id, 'account', range),
    windowReach(account.id, 'ad', range),
    listActions({ status: ['pending'], accountIds: [account.id] }),
    q<AlertRow>(`SELECT x.id, x.kind, x.severity, x.object_name, x.message, x.day::text, c.name AS client_name FROM meta_alerts x LEFT JOIN clients c ON c.id = x.client_id WHERE x.account_id = $1 AND x.status = 'open' ORDER BY x.day DESC, x.severity = 'bad' DESC LIMIT 30`, [account.id]),
    latestReport([account.id]),
    getSecret('anthropic.api_key'),
  ]);

  const cmp = compare(rows, current);
  const inRange = rows.filter((r) => r.day >= range.since && r.day <= range.until);
  const byC = totalsBy(inRange, 'campaign_id');
  const byS = totalsBy(inRange, 'adset_id');
  const byA = totalsBy(inRange, 'ad_id');
  const m = (t?: ReturnType<typeof totals>) => {
    const x = t ?? totals([]);
    return { spend: x.spend, results: x.results, cpa: x.cpa, roas: x.roas, ctr: x.ctr, impressions: x.impressions };
  };
  const tree: TreeNode[] = campaigns
    .map((c) => ({
      ...c, level: 'campaign' as const, m: m(byC.get(c.id)),
      children: adsets.filter((s) => s.campaign_id === c.id).map((s) => ({
        ...s, level: 'adset' as const, m: m(byS.get(s.id)),
        children: ads.filter((a) => a.adset_id === s.id).map((a) => ({ ...a, daily_budget: null, lifetime_budget: null, level: 'ad' as const, m: m(byA.get(a.id)) })),
      })),
    }))
    .sort((a, b) => b.m.spend - a.m.spend);

  const fatigue = assessFatigue(rows, { days: 7, end: range.until, frequencyCeiling: account.frequency_ceiling, windowFrequency: Object.fromEntries(Object.values(adReach.rows).map((r) => [r.id, r.frequency])) });
  const fat = new Map(fatigue.ads.map((f) => [f.ad_id, f]));
  const campName = new Map(campaigns.map((c) => [c.id, c.name]));
  const creatives: CreativeRow[] = ads
    .map((a) => {
      const t = byA.get(a.id) ?? totals([]);
      const f = fat.get(a.id);
      return {
        id: a.id, name: a.name, campaign: campName.get(a.campaign_id) ?? '', thumbnail: a.creative?.thumbnail_url ?? a.creative?.image_url ?? null,
        title: a.creative?.title ?? '', body: a.creative?.body ?? '', status: a.effective_status, spend: t.spend, results: t.results, cpa: t.cpa, ctr: t.ctr,
        frequency: adReach.rows[a.id]?.frequency ?? null,
        fatigue: (!f || f.status !== 'assessed' ? 'unknown' : f.fatigued ? 'fatigued' : f.declined ? 'declining' : 'ok') as CreativeRow['fatigue'],
        fatigue_note: f?.status === 'assessed' && f.declined ? `CTR ${Math.abs(Math.round(f.ctr_change_pct ?? 0))}% below its own best week${f.spend_since_decline ? `, ${new Intl.NumberFormat('en-US', { style: 'currency', currency: account.currency }).format(f.spend_since_decline)} spent since` : ''}.` : '',
      };
    })
    .filter((r) => r.spend > 0)
    // Rank by cost per result (with results), then by spend.
    .sort((a, b) => (a.cpa == null ? 1 : 0) - (b.cpa == null ? 1 : 0) || (a.cpa ?? 0) - (b.cpa ?? 0) || b.spend - a.spend)
    .slice(0, 15);

  const mainObjective = campaigns.find((c) => c.status === 'ACTIVE')?.objective ?? campaigns[0]?.objective ?? '';
  const series = dailySeries(inRange, range);
  const synced = account.last_synced_at;

  return (
    <>
      <PageHeader eyebrow={`Meta Ads · ${account.client_name ?? 'Not linked to a client'}`} title={account.name}>
        {readOnly ? (
          <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${account.id.replace(/^act_/, '')}`} target="_blank" rel="noreferrer" className="btn">
            <Icon name="external" size={14} /> Open in Ads Manager
          </a>
        ) : (
          <Link href={`/ads/new?account=${account.id}`} className="btn">
            <Icon name="plus" size={14} /> Campaign
          </Link>
        )}
        <Link href="/ads/connections" className="btn-ghost">
          <Icon name="plug" size={14} /> Connections
        </Link>
      </PageHeader>

      <AutoSync accountId={account.id} lastSynced={account.last_synced_at} />
      {readOnly && (
        <div className="panel mb-4 flex flex-wrap items-center gap-2 p-4 text-[13px] text-muted">
          <Badge tone="good" icon="lock">Read-only</Badge>
          Viewing only. Nothing here can change your campaigns; make changes in Ads Manager. Figures use the same attribution as Ads Manager.
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <AccountPicker current={account.id} accounts={accounts.map((a) => ({ id: a.id, label: `${a.client_name ? `${a.client_name} · ` : ''}${a.name}` }))} />
        <RangePicker current={range.days} />
        <span className="text-[12px] text-faint">{range.since} to {range.until}, compared with the {range.days} days before</span>
        <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Badge tone={synced ? 'good' : 'muted'}>{synced ? `Synced ${fmtAgo(synced)}` : 'Not synced yet'}</Badge>
          <Badge tone={acctReach.status === 'error' ? 'warn' : 'accent'}>{acctReach.status === 'error' ? 'Live reach unavailable' : `Reach live ${acctReach.status === 'cached' ? '(cached)' : ''}`}</Badge>
          <SyncAccountButton accountId={account.id} />
        </span>
      </div>
      {!account.client_id && (
        <div className="panel mb-4 p-4 text-[13px] text-warn">
          This ad account is not linked to a client, so it is not synced automatically.{' '}
          <Link href="/ads/connections" className="link">Link it</Link>
        </div>
      )}
      {account.sync_message.startsWith('error') && <div className="panel mb-4 p-4 text-[13px] text-bad">{account.sync_message}</div>}

      <KpiGrid cmp={cmp} currency={account.currency} resultLabel={resultLabel(mainObjective, account.result_event)} reach={acctReach.rows[account.id] ?? null} />

      {(cmp.chain || cmp.notes.length > 0) && (
        <Panel className="mt-4" title="What changed" icon="target">
          {cmp.chain && <p className="text-[14px] text-ink">{cmp.chain}</p>}
          {cmp.notes.map((n, i) => (
            <p key={i} className="mt-1 text-[12.5px] text-faint">{n}</p>
          ))}
        </Panel>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Daily spend" icon="money" className="xl:col-span-2">
          {series.some((d) => d.spend > 0) ? (
            <BarChart caption="Spend per day" height={200} highlightLast={false} currency={account.currency.toLowerCase()} bars={series.map((d) => ({ key: d.day, label: d.day.slice(8), value: Math.round(d.spend * 100), display: `${new Intl.NumberFormat('en-US', { style: 'currency', currency: account.currency }).format(d.spend)} · ${d.results.toFixed(0)} results` }))} />
          ) : (
            <Empty>No spend in this period{synced ? '' : ' yet. Sync the account to pull its history'}.</Empty>
          )}
        </Panel>
        <Panel title={`${readOnly ? 'Recommendations' : 'Waiting for approval'}${pending.length ? ` · ${pending.length}` : ''}`} icon="check" action={<Link href="/ads/activity" className="link text-[12px]">History</Link>}>
          <ApprovalQueue actions={pending} showClient={false} readOnly={readOnly} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Claude analysis" icon="target" className="xl:col-span-2">
          <ClaudePanel accountId={account.id} report={report} configured={Boolean(claudeKey)} />
        </Panel>
        <Panel title={`Alerts${alerts.length ? ` · ${alerts.length}` : ''}`} icon="alert">
          <AlertsList alerts={alerts} showClient={false} />
        </Panel>
      </div>

      <Panel title="Campaigns" icon="ads" className="mt-4" pad={false}>
        <div className="pt-3">{tree.length ? <CampaignTree accountId={account.id} currency={account.currency} nodes={tree} readOnly={readOnly} /> : <div className="p-5"><Empty>No campaigns synced for this account.</Empty></div>}</div>
      </Panel>

      <Panel title="Creative leaderboard · by cost per result" icon="grid" className="mt-4" pad={false}>
        <CreativeBoard accountId={account.id} currency={account.currency} rows={creatives} />
        {fatigue.notes.length > 0 && <div className="border-t border-line/60 px-5 py-3 text-[11.5px] text-faint">{fatigue.notes.join(' ')}</div>}
      </Panel>
    </>
  );
}

function SetupState() {
  return (
    <>
      <PageHeader eyebrow="Meta" title="Ads" />
      <Panel title="Connect Meta" icon="plug">
        <p className="max-w-2xl text-[14px] leading-relaxed text-muted">
          Connect each Meta Business you work in with a system-user token. Celo Command then finds every ad account it can reach, syncs performance daily, and lets you manage campaigns here, with every change waiting for your approval.
        </p>
        <Link href="/ads/connections" className="btn mt-5">
          <Icon name="plug" size={14} /> Add a Meta connection
        </Link>
      </Panel>
    </>
  );
}
