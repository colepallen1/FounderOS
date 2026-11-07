/**
 * Ads analysis: arithmetic only, no judgement, no I/O.
 *
 * Fatigue, period comparison and pacing are TypeScript ports of the methods in
 * meta-ads-agent (https://github.com/bartlomiejborzucki/meta-ads-agent, MIT,
 * Copyright (c) 2026 meta-ads-agent contributors): analysis/fatigue.py,
 * analysis/compare.py and analysis/pacing.py. Thresholds and rule texts follow
 * that source; deviations are noted inline.
 */

export type Row = {
  day: string; // YYYY-MM-DD
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  spend: number; // account currency, major units
  impressions: number;
  clicks: number;
  link_clicks: number;
  results: number;
  value: number; // conversion value, major units
};

export type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  results: number;
  value: number;
  cpm: number | null;
  ctr: number | null; // link CTR, %
  cpc: number | null; // cost per link click
  cvr: number | null; // results / link clicks, %
  cpa: number | null;
  roas: number | null;
  days: number;
};

const div = (a: number, b: number) => (b ? a / b : null);

/** Sums first, ratios after. Never average a rate across rows. */
export function totals(rows: Row[]): Totals {
  const t = rows.reduce(
    (s, r) => ({
      spend: s.spend + r.spend,
      impressions: s.impressions + r.impressions,
      clicks: s.clicks + r.clicks,
      link_clicks: s.link_clicks + r.link_clicks,
      results: s.results + r.results,
      value: s.value + r.value,
    }),
    { spend: 0, impressions: 0, clicks: 0, link_clicks: 0, results: 0, value: 0 },
  );
  const cpm = div(t.spend * 1000, t.impressions);
  const ctr = div(t.link_clicks * 100, t.impressions);
  return {
    ...t,
    cpm,
    ctr,
    cpc: div(t.spend, t.link_clicks),
    cvr: div(t.results * 100, t.link_clicks),
    cpa: div(t.spend, t.results),
    roas: t.value ? div(t.value, t.spend) : null,
    days: new Set(rows.map((r) => r.day)).size,
  };
}

// ── Dates ──────────────────────────────────────────────────────────────────

export type Window = { start: string; end: string; days: number };

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const windowEnding = (end: string, days: number): Window => ({ start: addDays(end, -(days - 1)), end, days });
export const before = (w: Window): Window => windowEnding(addDays(w.start, -1), w.days);
export const inWindow = (w: Window) => (r: { day: string }) => r.day >= w.start && r.day <= w.end;
export function windowDates(w: Window): string[] {
  return Array.from({ length: w.days }, (_, i) => addDays(w.start, i));
}

export function pctChange(previous: number | null, current: number | null): number | null {
  if (previous == null || current == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ── Period comparison (compare.py) ─────────────────────────────────────────

export const DEFAULT_NOISE_BAND_PCT = 10;
const COUNT = ['spend', 'impressions', 'link_clicks', 'results'] as const;
const CLICK_RATES = ['ctr', 'cpc'] as const;
const RESULT_RATES = ['cvr', 'cpa', 'roas'] as const;
export const METRICS = [...COUNT, 'cpm', ...CLICK_RATES, ...RESULT_RATES] as const;
export type Metric = (typeof METRICS)[number];
export type Classification = 'signal' | 'noise' | 'insufficient' | 'observed' | 'unavailable';
export type MetricChange = { metric: Metric; previous: number | null; current: number | null; pct: number | null; classification: Classification; direction: 'up' | 'down' | 'flat' };

export type Comparison = {
  current: Window;
  previous: Window;
  now: Totals;
  then: Totals;
  changes: Record<Metric, MetricChange>;
  chain: string | null;
  notes: string[];
};

export function compare(rows: Row[], current: Window, opts: { noiseBandPct?: number; minClicks?: number; minResults?: number } = {}): Comparison {
  const band = opts.noiseBandPct ?? DEFAULT_NOISE_BAND_PCT;
  const minClicks = opts.minClicks ?? 500;
  const minResults = opts.minResults ?? 30;
  const previous = before(current);
  const now = totals(rows.filter(inWindow(current)));
  const then = totals(rows.filter(inWindow(previous)));
  const changes = {} as Record<Metric, MetricChange>;
  for (const m of METRICS) {
    const p = then[m] as number | null;
    const c = now[m] as number | null;
    const pct = pctChange(p, c);
    let classification: Classification;
    // Counts are facts, never "signal". (compare.py treats results as a rate input; here it is shown as a count.)
    if ((COUNT as readonly string[]).includes(m)) classification = 'observed';
    else if (p == null || c == null || pct == null) classification = 'unavailable';
    else if (((CLICK_RATES as readonly string[]).includes(m) && Math.min(then.link_clicks, now.link_clicks) < minClicks) || ((RESULT_RATES as readonly string[]).includes(m) && Math.min(then.results, now.results) < minResults))
      classification = 'insufficient';
    else if (Math.abs(pct) < band) classification = 'noise';
    else classification = 'signal';
    const direction = classification === 'signal' && pct != null ? (pct > 0 ? 'up' : 'down') : 'flat';
    changes[m] = { metric: m, previous: p, current: c, pct, classification, direction };
  }
  const notes: string[] = [];
  const have = new Set(rows.map((r) => r.day));
  for (const [label, w] of [['current', current], ['previous', previous]] as const) {
    const missing = windowDates(w).filter((d) => !have.has(d));
    if (missing.length) notes.push(`The ${label} period has no data for ${missing.length} of ${w.days} days, so the comparison may be unfair.`);
  }
  return { current, previous, now, then, changes, chain: readChain(changes), notes };
}

/** compare.py _CHAIN_RULES: the next question a pattern of signal moves points to. */
const CHAIN_RULES: [Partial<Record<Metric, 'up' | 'down' | 'flat'>>, string][] = [
  [{ cpa: 'up', cvr: 'flat', cpc: 'up' }, 'Cost per result rose with conversion rate flat and cost per click up: the problem is upstream of the landing page.'],
  [{ cpc: 'up', ctr: 'flat', cpm: 'up' }, 'Cost per click rose with CTR flat and CPM up: the auction got more expensive, not the creative worse.'],
  [{ cpc: 'up', cpm: 'flat', ctr: 'down' }, 'Cost per click rose with CPM flat and CTR down: the creative is losing attention.'],
  [{ cpa: 'up', cpc: 'flat', cvr: 'down' }, 'Cost per result rose with cost per click flat and conversion rate down: look at the page, the offer, audience quality, or tracking.'],
];

export function readChain(changes: Record<Metric, MetricChange>): string | null {
  const hits = CHAIN_RULES.filter(([rule]) => Object.entries(rule).every(([k, v]) => changes[k as Metric]?.direction === v)).map(([, t]) => t);
  return hits.length ? hits.join(' ') : null;
}

// ── Creative fatigue (fatigue.py) ──────────────────────────────────────────

export type FatigueCondition = { name: 'frequency' | 'ctr_vs_own_baseline'; value: number | null; threshold: number | null; status: 'met' | 'not_met' | 'unknown' };
export type AdFatigue = {
  ad_id: string;
  adset_id: string;
  status: 'assessed' | 'insufficient';
  reason: string | null;
  current_ctr: number | null;
  baseline_ctr: number | null;
  baseline: Window | null;
  ctr_change_pct: number | null;
  conditions: FatigueCondition[];
  decline_started: string | null;
  spend_since_decline: number | null;
  days_with_delivery: number;
  declined: boolean;
  fatigued: boolean; // both conditions met
};
export type FatigueReport = { window: Window; ads: AdFatigue[]; notes: string[]; siblings: Record<string, { declined: string[]; held_up: string[]; insufficient: string[] }> };

/**
 * @param windowFrequency per ad, frequency from ONE row covering exactly `window` (Meta's own window reach).
 *        Summed daily reach double-counts people, so it is never used. Missing → condition "unknown".
 */
export function assessFatigue(
  rows: Row[],
  opts: { days?: number; end?: string; ctrDeclinePct?: number; frequencyCeiling?: number | null; minClicks?: number; windowFrequency?: Record<string, number> } = {},
): FatigueReport {
  const days = opts.days ?? 7;
  const threshold = opts.ctrDeclinePct ?? 30;
  const minClicks = opts.minClicks ?? 500;
  const ceiling = opts.frequencyCeiling ?? null;
  const end = opts.end ?? rows.reduce((m, r) => (r.day > m ? r.day : m), '');
  const window = windowEnding(end, days);
  const byAd = new Map<string, Row[]>();
  for (const r of rows) byAd.set(r.ad_id, [...(byAd.get(r.ad_id) ?? []), r]);
  const ads = [...byAd.keys()].sort().map((id) => assessOne(id, byAd.get(id)!, window, threshold, ceiling, minClicks, opts.windowFrequency?.[id] ?? null));
  const report: FatigueReport = { window, ads, notes: [], siblings: {} };
  const bySet = new Map<string, AdFatigue[]>();
  for (const a of ads) bySet.set(a.adset_id, [...(bySet.get(a.adset_id) ?? []), a]);
  for (const [setId, list] of bySet) {
    const assessed = list.filter((a) => a.status === 'assessed');
    report.siblings[setId] = { declined: assessed.filter((a) => a.declined).map((a) => a.ad_id), held_up: assessed.filter((a) => !a.declined).map((a) => a.ad_id), insufficient: list.filter((a) => a.status !== 'assessed').map((a) => a.ad_id) };
    if (assessed.length > 1 && assessed.every((a) => a.declined)) {
      report.notes.push(`Every assessed ad in ad set ${setId} declined together: the audience, the auction, tracking or seasonality is the likelier cause. New creative is unlikely to help.`);
    }
  }
  if (ceiling == null) report.notes.push('No frequency ceiling set for this account, so the frequency condition is unknown (never assumed met).');
  return report;
}

function priorWindows(rows: Row[], window: Window): Window[] {
  const earliest = rows.reduce((m, r) => (r.day < m ? r.day : m), rows[0].day);
  const out: Window[] = [];
  let end = addDays(window.start, -1);
  while (addDays(end, -(window.days - 1)) >= earliest) {
    out.push(windowEnding(end, window.days));
    end = addDays(end, -1);
  }
  return out;
}

function assessOne(adId: string, rows: Row[], window: Window, threshold: number, ceiling: number | null, minClicks: number, frequency: number | null): AdFatigue {
  const current = totals(rows.filter(inWindow(window)));
  const base: AdFatigue = {
    ad_id: adId,
    adset_id: rows[0].adset_id,
    status: 'insufficient',
    reason: null,
    current_ctr: current.ctr,
    baseline_ctr: null,
    baseline: null,
    ctr_change_pct: null,
    conditions: [],
    decline_started: null,
    spend_since_decline: null,
    days_with_delivery: new Set(rows.filter((r) => r.impressions > 0).map((r) => r.day)).size,
    declined: false,
    fatigued: false,
  };
  if (current.link_clicks < minClicks) return { ...base, reason: `${current.link_clicks} link clicks in the last ${window.days} days, below the ${minClicks}-click floor. CTR at this volume is not measurable.` };
  const eligible = priorWindows(rows, window)
    .map((w) => ({ w, t: totals(rows.filter(inWindow(w))) }))
    .filter(({ t }) => t.link_clicks >= minClicks && t.ctr != null);
  if (!eligible.length) return { ...base, reason: `No earlier ${window.days}-day period with at least ${minClicks} link clicks to compare this ad with.` };
  const best = eligible.reduce((a, b) => ((b.t.ctr ?? 0) > (a.t.ctr ?? 0) ? b : a));
  const change = pctChange(best.t.ctr, current.ctr);
  const declined = change != null && change <= -threshold;
  const conditions: FatigueCondition[] = [
    { name: 'frequency', value: frequency, threshold: ceiling, status: frequency == null || ceiling == null ? 'unknown' : frequency > ceiling ? 'met' : 'not_met' },
    { name: 'ctr_vs_own_baseline', value: change, threshold: -threshold, status: change == null ? 'unknown' : declined ? 'met' : 'not_met' },
  ];
  let declineStarted: string | null = null;
  let spendSince: number | null = null;
  if (declined && best.t.ctr != null) {
    const floor = best.t.ctr * (1 - threshold / 100);
    let start: string | null = null;
    let e = addDays(best.w.end, window.days);
    while (e <= window.end) {
      const rolling = windowEnding(e, window.days);
      const ctr = totals(rows.filter(inWindow(rolling))).ctr;
      const fallen = ctr != null && ctr <= floor;
      start = fallen ? (start ?? rolling.start) : null; // a recovery resets it
      e = addDays(e, 1);
    }
    if (start) {
      declineStarted = start;
      spendSince = rows.filter((r) => r.day >= start!).reduce((s, r) => s + r.spend, 0);
    }
  }
  return {
    ...base,
    status: 'assessed',
    baseline_ctr: best.t.ctr,
    baseline: best.w,
    ctr_change_pct: change,
    conditions,
    decline_started: declineStarted,
    spend_since_decline: spendSince,
    declined,
    fatigued: conditions.every((c) => c.status === 'met'),
  };
}

// ── Pacing (pacing.py, daily budgets) ──────────────────────────────────────

export type Pacing = { budget: number; days: { day: string; spend: number; utilisation: number }[]; spend: number; allowed: number; utilisation: number; under: string[]; over: string[] };

/** Spend against a daily budget. A day above budget is not an error (Meta balances over the week); it is listed. */
export function dailyPacing(spendByDay: Record<string, number>, budget: number, w: Window): Pacing {
  const days = windowDates(w).map((day) => {
    const spend = spendByDay[day] ?? 0;
    return { day, spend, utilisation: budget ? (spend / budget) * 100 : 0 };
  });
  const spend = days.reduce((s, d) => s + d.spend, 0);
  const allowed = budget * w.days;
  return {
    budget,
    days,
    spend,
    allowed,
    utilisation: allowed ? (spend / allowed) * 100 : 0,
    under: days.filter((d) => d.utilisation < 60).map((d) => d.day),
    over: days.filter((d) => d.utilisation > 125).map((d) => d.day),
  };
}

// ── Results: which action counts ───────────────────────────────────────────

const BY_OBJECTIVE: Record<string, string[]> = {
  OUTCOME_LEADS: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.messaging_conversation_started_7d'],
  OUTCOME_SALES: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  OUTCOME_ENGAGEMENT: ['onsite_conversion.messaging_conversation_started_7d', 'post_engagement'],
  OUTCOME_TRAFFIC: ['link_click'],
  OUTCOME_APP_PROMOTION: ['mobile_app_install', 'app_install'],
  OUTCOME_AWARENESS: [],
};
const VALUE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];

/**
 * Results and value for one insights row. An explicit account result event wins;
 * otherwise the first alias present for the campaign objective (aliases are never added together).
 */
export function resultsFor(actions: Record<string, number>, values: Record<string, number>, objective: string, explicit: string): { results: number; value: number } {
  const types = explicit ? [explicit] : BY_OBJECTIVE[objective] ?? [...BY_OBJECTIVE.OUTCOME_LEADS, ...BY_OBJECTIVE.OUTCOME_SALES];
  const hit = types.find((t) => actions[t] != null);
  const vt = (explicit ? [explicit, ...VALUE_TYPES] : VALUE_TYPES).find((t) => values[t] != null);
  return { results: hit ? actions[hit] : 0, value: vt ? values[vt] : 0 };
}

export function resultLabel(objective: string, explicit: string): string {
  const t = explicit || BY_OBJECTIVE[objective]?.[0] || 'result';
  return ({ lead: 'Leads', omni_purchase: 'Purchases', purchase: 'Purchases', link_click: 'Link clicks', 'onsite_conversion.messaging_conversation_started_7d': 'Conversations', post_engagement: 'Engagements' } as Record<string, string>)[t] ?? 'Results';
}
