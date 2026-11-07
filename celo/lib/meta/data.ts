import 'server-only';
import { q, one } from '../db';
import { accountToken } from './connections';
import { graphAll } from './graph';
import { resultsFor, totals, type Row, type Totals } from './analysis';

export type Range = { since: string; until: string };

/** Daily ad rows for the given accounts and range, results counted per objective / account setting. */
export async function rowsFor(accountIds: string[], range: Range): Promise<Row[]> {
  if (!accountIds.length) return [];
  const raw = await q<{ ad_id: string; adset_id: string; campaign_id: string; day: string; spend_cents: number; impressions: number; clicks: number; link_clicks: number; actions: Record<string, number>; action_values: Record<string, number>; objective: string; result_event: string }>(
    `SELECT i.ad_id, i.adset_id, i.campaign_id, i.day::text, i.spend_cents, i.impressions, i.clicks, i.link_clicks, i.actions, i.action_values,
       COALESCE(c.objective, '') AS objective, a.result_event
     FROM meta_insights_daily i JOIN meta_ad_accounts a ON a.id = i.account_id LEFT JOIN meta_campaigns c ON c.id = i.campaign_id
     WHERE i.account_id = ANY($1::text[]) AND i.day BETWEEN $2::date AND $3::date`,
    [accountIds, range.since, range.until],
  );
  return raw.map((r) => {
    const res = resultsFor(r.actions ?? {}, r.action_values ?? {}, r.objective, r.result_event);
    return {
      day: r.day,
      ad_id: r.ad_id,
      adset_id: r.adset_id,
      campaign_id: r.campaign_id,
      spend: Number(r.spend_cents) / 100,
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      link_clicks: Number(r.link_clicks),
      results: res.results,
      value: res.value,
    };
  });
}

export type Entity = { id: string; name: string; status: string; effective_status: string; daily_budget: number | null; lifetime_budget: number | null };
export type CampaignEntity = Entity & { account_id: string; objective: string };
export type AdsetEntity = Entity & { account_id: string; campaign_id: string; optimization_goal: string; targeting: Record<string, unknown> };
export type AdEntity = { id: string; account_id: string; name: string; status: string; effective_status: string; campaign_id: string; adset_id: string; creative: { thumbnail_url?: string; image_url?: string; title?: string; body?: string; call_to_action_type?: string } };

export async function structure(accountIds: string[]) {
  const [campaigns, adsets, ads] = await Promise.all([
    q<CampaignEntity>(`SELECT id, account_id, name, status, effective_status, objective, daily_budget, lifetime_budget FROM meta_campaigns WHERE account_id = ANY($1::text[]) ORDER BY name`, [accountIds]),
    q<AdsetEntity>(`SELECT id, account_id, campaign_id, name, status, effective_status, daily_budget, lifetime_budget, optimization_goal, targeting FROM meta_adsets WHERE account_id = ANY($1::text[]) ORDER BY name`, [accountIds]),
    q<AdEntity>(`SELECT id, account_id, campaign_id, adset_id, name, status, effective_status, creative FROM meta_ads WHERE account_id = ANY($1::text[]) ORDER BY name`, [accountIds]),
  ]);
  return { campaigns, adsets, ads };
}

/** Group rows by an id and total each group. */
export function totalsBy(rows: Row[], key: 'campaign_id' | 'adset_id' | 'ad_id'): Map<string, Totals> {
  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r[key], [...(groups.get(r[key]) ?? []), r]);
  return new Map([...groups].map(([k, v]) => [k, totals(v)]));
}

export function dailySeries(rows: Row[], range: Range): { day: string; spend: number; results: number; value: number }[] {
  const out: { day: string; spend: number; results: number; value: number }[] = [];
  const d = new Date(`${range.since}T00:00:00Z`);
  const end = new Date(`${range.until}T00:00:00Z`);
  const by = new Map<string, { spend: number; results: number; value: number }>();
  for (const r of rows) {
    const x = by.get(r.day) ?? { spend: 0, results: 0, value: 0 };
    x.spend += r.spend;
    x.results += r.results;
    x.value += r.value;
    by.set(r.day, x);
  }
  while (d <= end) {
    const day = d.toISOString().slice(0, 10);
    out.push({ day, ...(by.get(day) ?? { spend: 0, results: 0, value: 0 }) });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export type ReachRow = { id: string; reach: number; frequency: number; impressions: number };
export type ReachResult = { status: 'live' | 'cached' | 'error'; fetched_at: string | null; rows: Record<string, ReachRow>; error?: string };

/**
 * Reach and frequency for exactly this range, straight from Meta (one row per entity covering the
 * whole window). Cached 15 minutes. Daily reach is never summed: that double-counts people.
 */
export async function windowReach(accountId: string, level: 'account' | 'campaign' | 'ad', range: Range): Promise<ReachResult> {
  const key = `reach:${accountId}:${level}:${range.since}:${range.until}`;
  const cached = await one<{ value: Record<string, ReachRow>; fetched_at: string }>(`SELECT value, fetched_at::text FROM meta_cache WHERE key = $1 AND fetched_at > now() - interval '15 minutes'`, [key]);
  if (cached) return { status: 'cached', fetched_at: cached.fetched_at, rows: cached.value };
  try {
    const { token } = await accountToken(accountId);
    const idField = level === 'account' ? 'account_id' : `${level}_id`;
    const raw = await graphAll<Record<string, string>>(token, `${accountId}/insights`, { level, time_range: { since: range.since, until: range.until }, fields: `${idField},reach,frequency,impressions`, limit: 500 }, 10);
    const rows: Record<string, ReachRow> = {};
    for (const r of raw) {
      const id = level === 'account' ? accountId : r[idField];
      rows[id] = { id, reach: Number(r.reach ?? 0), frequency: Number(r.frequency ?? 0), impressions: Number(r.impressions ?? 0) };
    }
    await q(`INSERT INTO meta_cache (key, value, fetched_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, fetched_at = now()`, [key, JSON.stringify(rows)]);
    return { status: 'live', fetched_at: new Date().toISOString(), rows };
  } catch (err) {
    return { status: 'error', fetched_at: null, rows: {}, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Parse ?range=7|14|30|90 or ?since=&until= into a range ending yesterday or today. */
export function parseRange(sp: { range?: string; since?: string; until?: string }, today: string): Range & { days: number; label: string } {
  const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const s = valid(sp.since);
  const u = valid(sp.until);
  if (s && u && s <= u) {
    const days = Math.round((Date.parse(u) - Date.parse(s)) / 86400000) + 1;
    return { since: s, until: u, days, label: `${s} to ${u}` };
  }
  const days = [7, 14, 30, 90].includes(Number(sp.range)) ? Number(sp.range) : 7;
  const until = today;
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { since, until, days, label: `Last ${days} days` };
}
