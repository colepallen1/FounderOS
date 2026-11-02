import 'server-only';
import { getSecret } from '../settings';
import { q } from '../db';
import { META_VERSION } from './meta';
import { minorUnits, parsePerf, type Perf } from './meta-parse';

/** Overridable for tests (a local stub of the Graph API). */
const GRAPH = (process.env.META_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/$/, '');

export type MetaNode = {
  id: string;
  name: string;
  status: string; // ACTIVE | PAUSED | ARCHIVED ...
  effective_status: string; // includes CAMPAIGN_PAUSED, ADSET_PAUSED, IN_PROCESS, WITH_ISSUES ...
  daily_budget: number | null; // account minor units
  lifetime_budget: number | null;
  perf: Perf;
};
export type MetaCampaign = MetaNode & { objective: string; adsets: MetaNode[] };
export type MetaAccount = { id: string; name: string; currency: string; unit: number; campaigns: MetaCampaign[] };

export function actId(raw: string): string {
  const id = raw.trim().replace(/^act_/, '');
  return `act_${id}`;
}

async function graph<T>(path: string, init?: { method?: 'GET' | 'POST'; params?: Record<string, string> }): Promise<T> {
  const token = await getSecret('meta.access_token');
  if (!token) throw new Error('Meta is not connected.');
  const method = init?.method ?? 'GET';
  const params = new URLSearchParams({ ...(init?.params ?? {}), access_token: token });
  const url = `${GRAPH}/${META_VERSION}/${path}${method === 'GET' ? `?${params}` : ''}`;
  const res = await fetch(url, method === 'POST' ? { method, body: params, cache: 'no-store' } : { cache: 'no-store' });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `Meta returned ${res.status}`;
    if (json.error?.code === 200 || /ads_management/i.test(msg)) throw new Error('The Meta token can only read. Generate it with the ads_management permission to make changes here.');
    throw new Error(msg);
  }
  return json;
}

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const PERF = 'insights.date_preset(last_7d){spend,actions,action_values}';

type RawNode = { id: string; name: string; status: string; effective_status: string; daily_budget?: string; lifetime_budget?: string; insights?: { data?: never[] } };
function node(r: RawNode): MetaNode {
  return { id: r.id, name: r.name, status: r.status, effective_status: r.effective_status, daily_budget: num(r.daily_budget), lifetime_budget: num(r.lifetime_budget), perf: parsePerf(r.insights) };
}

async function all<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await graph<{ data: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, { params: { ...params, limit: '100', ...(after ? { after } : {}) } });
    out.push(...r.data);
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

/** Live view of an ad account: campaigns (newest first) with their ad sets and last-7-day results. */
export async function loadAccount(rawActId: string): Promise<MetaAccount> {
  const act = actId(rawActId);
  const statuses = JSON.stringify(['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'PENDING_REVIEW']);
  const [acct, campaigns, adsets] = await Promise.all([
    graph<{ id: string; name: string; currency: string }>(act, { params: { fields: 'name,currency' } }),
    all<RawNode & { objective: string }>(`${act}/campaigns`, { fields: `id,name,status,effective_status,objective,daily_budget,lifetime_budget,${PERF}`, effective_status: statuses }),
    all<RawNode & { campaign_id: string }>(`${act}/adsets`, { fields: `id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,${PERF}`, effective_status: statuses }),
  ]);
  return {
    id: act,
    name: acct.name,
    currency: acct.currency,
    unit: minorUnits(acct.currency),
    campaigns: campaigns.map((c) => ({ ...node(c), objective: c.objective, adsets: adsets.filter((a) => a.campaign_id === c.id).map(node) })),
  };
}

/** Confirm a campaign / ad set belongs to this client's ad account before touching it. */
async function owned(objectId: string, rawActId: string): Promise<{ name: string; status: string; daily_budget: number | null }> {
  const o = await graph<{ id: string; name: string; status: string; account_id: string; daily_budget?: string }>(objectId, { params: { fields: 'name,status,account_id,daily_budget' } });
  if (actId(o.account_id) !== actId(rawActId)) throw new Error('That campaign is not in this client’s ad account.');
  return { name: o.name, status: o.status, daily_budget: num(o.daily_budget) };
}

async function audit(clientId: string, objectId: string, name: string, change: string, from: string, to: string) {
  await q(`INSERT INTO ad_changes (client_id, object_id, object_name, change, old_value, new_value) VALUES ($1,$2,$3,$4,$5,$6)`, [clientId, objectId, name, change, from, to]);
}

export async function setStatus(clientId: string, rawActId: string, objectId: string, status: 'ACTIVE' | 'PAUSED') {
  const o = await owned(objectId, rawActId);
  await graph(objectId, { method: 'POST', params: { status } });
  await audit(clientId, objectId, o.name, 'status', o.status, status);
}

export async function setDailyBudget(clientId: string, rawActId: string, objectId: string, minor: number) {
  const o = await owned(objectId, rawActId);
  if (o.daily_budget == null) throw new Error('This one has no daily budget to change (the budget is set at the campaign or ad set level, or it uses a lifetime budget).');
  await graph(objectId, { method: 'POST', params: { daily_budget: String(Math.round(minor)) } });
  await audit(clientId, objectId, o.name, 'daily_budget', String(o.daily_budget), String(Math.round(minor)));
}
