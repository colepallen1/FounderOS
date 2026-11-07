import 'server-only';
import { q } from '../db';
import { toDay } from '../recurring';
import { accountToken, listAccounts, migrateLegacyToken, type AdAccount } from './connections';
import { graphAll } from './graph';
import { resultsFor } from './analysis';
import { runRules } from './rules';

type RawNode = { id: string; name: string; status: string; effective_status: string; daily_budget?: string; lifetime_budget?: string };
type Action = { action_type: string; value: string };
type InsightRow = {
  ad_id: string; adset_id: string; campaign_id: string; date_start: string;
  spend?: string; impressions?: string; reach?: string; clicks?: string; inline_link_clicks?: string;
  actions?: Action[]; action_values?: Action[];
};

const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
const toMap = (list?: Action[]) => Object.fromEntries((list ?? []).map((a) => [a.action_type, Number(a.value) || 0]));

async function syncStructure(token: string, act: string) {
  const [campaigns, adsets, ads] = await Promise.all([
    graphAll<RawNode & { objective?: string; start_time?: string; stop_time?: string }>(token, `${act}/campaigns`, { fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time' }),
    graphAll<RawNode & { campaign_id: string; optimization_goal?: string; targeting?: object }>(token, `${act}/adsets`, { fields: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,targeting' }),
    graphAll<RawNode & { campaign_id: string; adset_id: string; creative?: Record<string, unknown> }>(token, `${act}/ads`, {
      fields: 'id,name,campaign_id,adset_id,status,effective_status,creative{id,title,body,thumbnail_url,image_url,call_to_action_type,object_story_spec}',
    }),
  ]);
  for (const c of campaigns) {
    await q(
      `INSERT INTO meta_campaigns (id, account_id, name, status, effective_status, objective, daily_budget, lifetime_budget, start_time, stop_time, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, status=EXCLUDED.status, effective_status=EXCLUDED.effective_status, objective=EXCLUDED.objective,
         daily_budget=EXCLUDED.daily_budget, lifetime_budget=EXCLUDED.lifetime_budget, start_time=EXCLUDED.start_time, stop_time=EXCLUDED.stop_time, synced_at=now()`,
      [c.id, act, c.name, c.status, c.effective_status, c.objective ?? '', n(c.daily_budget), n(c.lifetime_budget), c.start_time ?? null, c.stop_time ?? null],
    );
  }
  for (const s of adsets) {
    await q(
      `INSERT INTO meta_adsets (id, account_id, campaign_id, name, status, effective_status, daily_budget, lifetime_budget, optimization_goal, targeting, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (id) DO UPDATE SET campaign_id=EXCLUDED.campaign_id, name=EXCLUDED.name, status=EXCLUDED.status, effective_status=EXCLUDED.effective_status,
         daily_budget=EXCLUDED.daily_budget, lifetime_budget=EXCLUDED.lifetime_budget, optimization_goal=EXCLUDED.optimization_goal, targeting=EXCLUDED.targeting, synced_at=now()`,
      [s.id, act, s.campaign_id, s.name, s.status, s.effective_status, n(s.daily_budget), n(s.lifetime_budget), s.optimization_goal ?? '', JSON.stringify(s.targeting ?? {})],
    );
  }
  for (const a of ads) {
    await q(
      `INSERT INTO meta_ads (id, account_id, campaign_id, adset_id, name, status, effective_status, creative, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (id) DO UPDATE SET campaign_id=EXCLUDED.campaign_id, adset_id=EXCLUDED.adset_id, name=EXCLUDED.name, status=EXCLUDED.status,
         effective_status=EXCLUDED.effective_status, creative=EXCLUDED.creative, synced_at=now()`,
      [a.id, act, a.campaign_id, a.adset_id, a.name, a.status, a.effective_status, JSON.stringify(a.creative ?? {})],
    );
  }
  return { campaigns: campaigns.length, adsets: adsets.length, ads: ads.length };
}

async function syncInsights(token: string, account: AdAccount): Promise<number> {
  const today = toDay(new Date());
  // Meta revises attributed conversions for several days, so the last week is always re-read.
  const since = account.last_synced_at ? toDay(new Date(Date.now() - 7 * 86400000)) : toDay(new Date(Date.now() - 90 * 86400000));
  const rows = await graphAll<InsightRow>(
    token,
    `${account.id}/insights`,
    {
      level: 'ad',
      time_increment: 1,
      time_range: { since, until: today },
      fields: 'ad_id,adset_id,campaign_id,spend,impressions,reach,clicks,inline_link_clicks,actions,action_values',
      limit: 500,
    },
    50,
  );
  for (const r of rows) {
    await q(
      `INSERT INTO meta_insights_daily (ad_id, day, account_id, campaign_id, adset_id, spend_cents, impressions, reach, clicks, link_clicks, actions, action_values)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (ad_id, day) DO UPDATE SET spend_cents=EXCLUDED.spend_cents, impressions=EXCLUDED.impressions, reach=EXCLUDED.reach, clicks=EXCLUDED.clicks,
         link_clicks=EXCLUDED.link_clicks, actions=EXCLUDED.actions, action_values=EXCLUDED.action_values, campaign_id=EXCLUDED.campaign_id, adset_id=EXCLUDED.adset_id`,
      [
        r.ad_id, r.date_start, account.id, r.campaign_id, r.adset_id,
        Math.round(Number(r.spend ?? 0) * 100), Number(r.impressions ?? 0), Number(r.reach ?? 0), Number(r.clicks ?? 0), Number(r.inline_link_clicks ?? 0),
        JSON.stringify(toMap(r.actions)), JSON.stringify(toMap(r.action_values)),
      ],
    );
  }
  return rows.length;
}

/** Keep the per-client daily totals (ad_metrics) the rest of the app reads. */
async function rollUpClient(account: AdAccount) {
  if (!account.client_id) return;
  const rows = await q<{ day: string; spend_cents: number; impressions: number; link_clicks: number; actions: Record<string, number>; action_values: Record<string, number>; objective: string }>(
    `SELECT i.day::text, i.spend_cents, i.impressions, i.link_clicks, i.actions, i.action_values, COALESCE(c.objective, '') AS objective
     FROM meta_insights_daily i LEFT JOIN meta_campaigns c ON c.id = i.campaign_id
     WHERE i.account_id = $1 AND i.day > (now() - interval '95 days')::date`,
    [account.id],
  );
  const byDay = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number; value: number }>();
  for (const r of rows) {
    const d = byDay.get(r.day) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 };
    const res = resultsFor(r.actions, r.action_values, r.objective, account.result_event);
    d.spend += Number(r.spend_cents);
    d.impressions += Number(r.impressions);
    d.clicks += Number(r.link_clicks);
    d.conversions += res.results;
    d.value += Math.round(res.value * 100);
    byDay.set(r.day, d);
  }
  for (const [day, d] of byDay) {
    await q(
      `INSERT INTO ad_metrics (client_id, platform, day, spend_cents, impressions, clicks, conversions, conversion_value_cents) VALUES ($1,'meta',$2,$3,$4,$5,$6,$7)
       ON CONFLICT (client_id, platform, day) DO UPDATE SET spend_cents=EXCLUDED.spend_cents, impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks,
         conversions=EXCLUDED.conversions, conversion_value_cents=EXCLUDED.conversion_value_cents`,
      [account.client_id, day, d.spend, d.impressions, d.clicks, d.conversions, d.value],
    );
  }
}

export async function syncAccount(account: AdAccount): Promise<string> {
  try {
    const { token } = await accountToken(account.id);
    const s = await syncStructure(token, account.id);
    const n = await syncInsights(token, account);
    await rollUpClient(account);
    const fresh = { ...account, last_synced_at: new Date().toISOString() };
    const r = await runRules(fresh).catch(() => ({ alerts: 0, proposals: 0 }));
    const msg = `${s.campaigns} campaigns, ${s.adsets} ad sets, ${s.ads} ads, ${n} daily rows, ${r.alerts} alerts, ${r.proposals} proposals`;
    await q(`UPDATE meta_ad_accounts SET last_synced_at = now(), sync_message = $2 WHERE id = $1`, [account.id, msg]);
    return msg;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await q(`UPDATE meta_ad_accounts SET sync_message = $2 WHERE id = $1`, [account.id, `error: ${msg}`.slice(0, 500)]);
    throw err;
  }
}

/** Sync every ad account that is linked to a client (unlinked accounts are listed but not pulled). */
export async function syncAllMeta(): Promise<string> {
  await migrateLegacyToken();
  const accounts = (await listAccounts()).filter((a) => a.client_id);
  if (!accounts.length) return 'no ad accounts linked to clients';
  const out: string[] = [];
  let failed = 0;
  for (const a of accounts) {
    try {
      await syncAccount(a);
      out.push(a.name);
    } catch {
      failed++;
    }
  }
  if (failed && !out.length) throw new Error(`all ${failed} ad accounts failed; see Ads → Connections`);
  return `${out.length} ad account${out.length === 1 ? '' : 's'} synced${failed ? `, ${failed} failed` : ''}`;
}
