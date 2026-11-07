import 'server-only';
import { appSecret } from '../config';
import { sign } from '../token';
import { clientAccounts } from './connections';
import { compare, resultLabel, totals, windowEnding, type Comparison, type Totals } from './analysis';
import { dailySeries, rowsFor, structure, totalsBy, windowReach, type Range } from './data';
import { latestReport } from '../ai/ads-analyst';

export type ClientReportData = {
  range: Range & { days: number };
  currency: string;
  accounts: { id: string; name: string }[];
  cmp: Comparison;
  reach: { reach: number; frequency: number } | null;
  resultLabel: string;
  series: { day: string; spend: number; results: number; value: number }[];
  campaigns: { id: string; name: string; status: string; t: Totals }[];
  creatives: { id: string; name: string; thumbnail: string | null; t: Totals }[];
  summary: { text: string; source: 'claude' | 'computed'; at: string | null };
};

const money = (n: number | null, c: string) => (n == null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n));

/** Everything a client report shows. Only reads ad accounts linked to this client. */
export async function clientReport(clientId: string, range: Range & { days: number }): Promise<ClientReportData | null> {
  const accounts = await clientAccounts(clientId);
  if (!accounts.length) return null;
  const ids = accounts.map((a) => a.id);
  const currency = accounts[0].currency;
  const current = windowEnding(range.until, range.days);
  const rows = await rowsFor(ids, { since: windowEnding(range.until, range.days * 2).start, until: range.until });
  const inRange = rows.filter((r) => r.day >= range.since && r.day <= range.until);
  const cmp = compare(rows, current, { minClicks: 100, minResults: 10 });
  const { campaigns, ads } = await structure(ids);
  const byC = totalsBy(inRange, 'campaign_id');
  const byA = totalsBy(inRange, 'ad_id');
  // Reach: Meta's own window figure. Only shown for a single account (people across accounts can't be de-duplicated).
  const reach = ids.length === 1 ? (await windowReach(ids[0], 'account', range)).rows[ids[0]] ?? null : null;
  const objective = campaigns.find((c) => c.status === 'ACTIVE')?.objective ?? campaigns[0]?.objective ?? '';
  const ai = await latestReport(ids);
  const t = cmp.now;
  const computed = t.spend
    ? `${money(t.spend, currency)} spent over ${range.days} days for ${t.results.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${resultLabel(objective, accounts[0].result_event).toLowerCase()}${t.cpa != null ? ` at ${money(t.cpa, currency)} each` : ''}${t.roas != null ? `, ${t.roas.toFixed(2)}x return on ad spend` : ''}.`
    : 'No ad spend in this period.';
  return {
    range,
    currency,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    cmp,
    reach,
    resultLabel: resultLabel(objective, accounts[0].result_event),
    series: dailySeries(inRange, range),
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, status: c.effective_status, t: byC.get(c.id) ?? totals([]) })).filter((c) => c.t.spend > 0).sort((a, b) => b.t.spend - a.t.spend),
    creatives: ads
      .map((a) => ({ id: a.id, name: a.name, thumbnail: a.creative?.thumbnail_url ?? a.creative?.image_url ?? null, t: byA.get(a.id) ?? totals([]) }))
      .filter((a) => a.t.results > 0)
      .sort((a, b) => (a.t.cpa ?? Infinity) - (b.t.cpa ?? Infinity))
      .slice(0, 6),
    summary: ai ? { text: ai.content.client_summary, source: 'claude', at: ai.created_at } : { text: computed, source: 'computed', at: null },
  };
}

// ── Read-only share links (one client, expiring) ───────────────────────────

export async function shareToken(clientId: string, days = 30): Promise<string> {
  const secret = appSecret();
  if (!secret) throw new Error('CELO_SECRET is not set.');
  const exp = Date.now() + days * 86400000;
  const body = Buffer.from(`${clientId}.${exp}`).toString('base64url');
  return `${body}.${await sign(`report:${clientId}:${exp}`, secret)}`;
}

export async function readShareToken(token: string): Promise<string | null> {
  const secret = appSecret();
  const [body, sig] = token.split('.');
  if (!secret || !body || !sig) return null;
  const [clientId, exp] = Buffer.from(body, 'base64url').toString().split('.');
  if (!clientId || !exp || Number(exp) < Date.now()) return null;
  return (await sign(`report:${clientId}:${exp}`, secret)) === sig ? clientId : null;
}
