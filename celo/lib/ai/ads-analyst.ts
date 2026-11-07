import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import { q, one, newId } from '../db';
import { getSecret } from '../settings';
import { toDay } from '../recurring';
import type { AdAccount } from '../meta/connections';
import { assessFatigue, compare, resultLabel, totals, windowEnding, type Totals } from '../meta/analysis';
import { rowsFor, structure, totalsBy, windowReach } from '../meta/data';
import { propose } from '../meta/actions';
import { checkBudgetChange } from '../integrations/meta-parse';

export const MODEL = 'claude-opus-5-5';

export const Analysis = z.object({
  headline: z.string().describe('One line, plain English, the single most important thing.'),
  status: z.enum(['on_track', 'watch', 'off_track']),
  summary: z.string().describe('3-5 sentences for the agency owner: what happened, why (from the data given), what to do.'),
  client_summary: z.string().describe('2-3 sentences suitable to send to the client: results first, no internal jargon, no blame.'),
  winners: z.array(z.object({ id: z.string(), name: z.string(), why: z.string() })),
  losers: z.array(z.object({ id: z.string(), name: z.string(), why: z.string() })),
  fatigue: z.array(z.object({ ad_id: z.string(), name: z.string(), assessment: z.string() })),
  recommendations: z.array(
    z.object({
      type: z.enum(['pause', 'resume', 'increase_budget', 'decrease_budget', 'new_creative', 'audience', 'tracking', 'other']),
      object_id: z.string().nullable(),
      object_name: z.string(),
      new_daily_budget: z.number().nullable().describe('Major currency units, only for budget changes'),
      rationale: z.string(),
      confidence: z.enum(['low', 'medium', 'high']),
    }),
  ),
  watch_next: z.array(z.string()),
});
export type AnalysisT = z.infer<typeof Analysis>;

const SYSTEM = `You are the performance analyst for Celo Digital, an agency that runs Meta ads for small and mid-sized businesses.
You receive numbers that were already computed by deterministic code. Rules:
- Use only the numbers given. Never invent, recompute or estimate a metric that is not in the data. If something is unknown, say so.
- Respect the classifications: a change marked "noise" or "insufficient" is not a trend; do not call it one.
- Frequency comes only from Meta's window reach; if it is missing, do not guess it.
- Fatigue is an ad's CTR against its own best earlier week. If every ad in an ad set declined together, the cause is more likely audience, auction, tracking or seasonality than creative.
- Raising the budget of a campaign that is not spending its budget does not help.
- Budget recommendations change spend by at most 20-30% at a time, and only with enough results to judge (aim for 10+ results in the window).
- Recommendations are proposals a human approves. Be specific about which campaign or ad, and why.
- Write plainly. No hype, no emojis.`;

function pick(t: Totals) {
  const r = (v: number | null, d = 2) => (v == null ? null : Number(v.toFixed(d)));
  return { spend: r(t.spend), impressions: t.impressions, link_clicks: t.link_clicks, results: r(t.results, 1), value: r(t.value), cpm: r(t.cpm), ctr_pct: r(t.ctr), cpc: r(t.cpc), cvr_pct: r(t.cvr), cost_per_result: r(t.cpa), roas: r(t.roas) };
}

/** Everything Claude sees, computed here. */
export async function buildContext(a: AdAccount, days: number) {
  const today = toDay(new Date());
  const w = windowEnding(today, days);
  const rows = await rowsFor([a.id], { since: windowEnding(today, Math.max(days * 2, 42)).start, until: today });
  const { campaigns, adsets, ads } = await structure([a.id]);
  const cmp = compare(rows, w);
  const inW = rows.filter((r) => r.day >= w.start && r.day <= w.end);
  const byCampaign = totalsBy(inW, 'campaign_id');
  const byAd = totalsBy(inW, 'ad_id');
  const reach = await windowReach(a.id, 'ad', { since: w.start, until: w.end });
  const acctReach = await windowReach(a.id, 'account', { since: w.start, until: w.end });
  const fatigue = assessFatigue(rows, { days: 7, end: today, frequencyCeiling: a.frequency_ceiling, windowFrequency: Object.fromEntries(Object.values(reach.rows).map((r) => [r.id, r.frequency])) });
  const alerts = await q(`SELECT kind, severity, object_name, message FROM meta_alerts WHERE account_id = $1 AND status = 'open' AND day > $2::date - 7 ORDER BY created_at DESC LIMIT 20`, [a.id, today]);
  return {
    account: { id: a.id, name: a.name, currency: a.currency, client: a.client_name },
    window: { start: w.start, end: w.end, days, compared_with: cmp.previous },
    targets: { cost_per_result: a.target_cpa_cents != null ? a.target_cpa_cents / 100 : null, roas: a.target_roas, frequency_ceiling: a.frequency_ceiling },
    totals: { current: pick(cmp.now), previous: pick(cmp.then), reach: acctReach.rows[a.id] ?? null },
    changes: Object.fromEntries(Object.entries(cmp.changes).map(([k, v]) => [k, { pct: v.pct == null ? null : Number(v.pct.toFixed(1)), classification: v.classification }])),
    diagnosis: cmp.chain,
    data_notes: [...cmp.notes, ...fatigue.notes, ...(reach.status === 'error' ? [`Frequency unavailable: ${reach.error}`] : [])],
    campaigns: campaigns.map((c) => ({
      id: c.id, name: c.name, status: c.effective_status, objective: c.objective, result: resultLabel(c.objective, a.result_event),
      daily_budget: c.daily_budget != null ? c.daily_budget / 100 : null, adsets: adsets.filter((s) => s.campaign_id === c.id).length,
      ...pick(byCampaign.get(c.id) ?? totals([])),
    })),
    ads: ads
      .map((ad) => ({ id: ad.id, name: ad.name, campaign_id: ad.campaign_id, status: ad.effective_status, frequency: reach.rows[ad.id]?.frequency ?? null, ...pick(byAd.get(ad.id) ?? totals([])) }))
      .filter((x) => x.spend)
      .sort((x, y) => (y.spend ?? 0) - (x.spend ?? 0))
      .slice(0, 40),
    fatigue: fatigue.ads.map((f) => ({ ad_id: f.ad_id, status: f.status, reason: f.reason, ctr_change_pct: f.ctr_change_pct == null ? null : Number(f.ctr_change_pct.toFixed(1)), declined: f.declined, fatigued: f.fatigued, spend_since_decline: f.spend_since_decline, decline_started: f.decline_started })),
    open_alerts: alerts,
  };
}

export async function anthropicClient(): Promise<Anthropic | null> {
  const key = await getSecret('anthropic.api_key');
  return key ? new Anthropic({ apiKey: key }) : null;
}

export async function analyze(a: AdAccount, kind: 'daily' | 'weekly' | 'analysis'): Promise<{ id: string; analysis: AnalysisT; proposals: number }> {
  const client = await anthropicClient();
  if (!client) throw new Error('Claude is not configured. Add an Anthropic API key under Integrations.');
  const days = kind === 'daily' ? 7 : kind === 'weekly' ? 7 : 14;
  const context = await buildContext(a, days);
  const task =
    kind === 'daily'
      ? 'Write the daily briefing for this ad account: what happened in the window, the trend, anything to act on today.'
      : kind === 'weekly'
        ? 'Write the weekly performance summary for this ad account: last 7 days against the 7 before, winners and losers, what to change next week.'
        : 'Analyse this ad account in depth: winning and losing campaigns and ads, creative fatigue, budget moves, and an optimisation strategy.';

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: kind === 'analysis' ? 'high' : 'medium', format: zodOutputFormat(Analysis) },
    messages: [{ role: 'user', content: `${task}\n\nData (JSON):\n${JSON.stringify(context)}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to analyse this data.');
  if (response.stop_reason === 'max_tokens') throw new Error('Claude ran out of room before finishing; try again.');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const analysis = Analysis.parse(JSON.parse(text));

  const id = newId('air');
  await q(`INSERT INTO ai_reports (id, client_id, account_id, kind, period_start, period_end, content, model, usage) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
    id, a.client_id, a.id, kind, context.window.start, context.window.end, JSON.stringify(analysis), response.model, JSON.stringify(response.usage),
  ]);

  // Turn concrete recommendations into proposals that wait for approval.
  let proposals = 0;
  const camps = new Map(context.campaigns.map((c) => [c.id, c]));
  for (const r of analysis.recommendations) {
    if (!r.object_id || !camps.has(r.object_id)) continue;
    const c = camps.get(r.object_id)!;
    if (r.type === 'pause' || r.type === 'resume') {
      if (await propose({ account_id: a.id, kind: r.type, object_id: c.id, object_name: c.name, summary: `${r.type === 'pause' ? 'Pause' : 'Turn on'} "${c.name}"`, risk: r.type === 'resume' ? 'spend' : 'material', source: 'claude', rationale: r.rationale })) proposals++;
    }
    if ((r.type === 'increase_budget' || r.type === 'decrease_budget') && r.new_daily_budget != null && c.daily_budget != null) {
      const next = Math.round(r.new_daily_budget * 100);
      const from = Math.round(c.daily_budget * 100);
      if (checkBudgetChange(from, next, 100)) continue; // outside the safe step: not proposed
      if (await propose({ account_id: a.id, kind: 'budget', object_id: c.id, object_name: c.name, payload: { daily_budget: next, from }, summary: `${next > from ? 'Raise' : 'Cut'} "${c.name}" daily budget ${c.daily_budget} → ${r.new_daily_budget} ${a.currency}`, risk: next > from ? 'spend' : 'material', source: 'claude', rationale: r.rationale })) proposals++;
    }
  }
  return { id, analysis, proposals };
}

export type StoredReport = { id: string; kind: string; period_start: string; period_end: string; content: AnalysisT; model: string; created_at: string };

export async function latestReport(accountIds: string[], kind?: string): Promise<StoredReport | null> {
  if (!accountIds.length) return null;
  return one<StoredReport>(
    `SELECT id, kind, period_start::text, period_end::text, content, model, created_at::text FROM ai_reports WHERE account_id = ANY($1::text[]) ${kind ? 'AND kind = $2' : ''} ORDER BY created_at DESC LIMIT 1`,
    kind ? [accountIds, kind] : [accountIds],
  );
}
