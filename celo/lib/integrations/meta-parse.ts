/** Pure Meta insights parsing (unit tested). */
type Action = { action_type: string; value: string };
export type InsightRow = { date_start: string; spend?: string; impressions?: string; clicks?: string; actions?: Action[]; action_values?: Action[] };

const LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];

/** Prefer the first type present, so the same event isn't counted under several aliases. */
function firstOf(list: Action[] | undefined, types: string[]): number {
  for (const t of types) {
    const hit = list?.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

export function parseMetaInsight(r: InsightRow) {
  return {
    spend: Math.round(Number(r.spend ?? 0) * 100),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    conversions: firstOf(r.actions, LEAD_TYPES) + firstOf(r.actions, PURCHASE_TYPES),
    value: Math.round(firstOf(r.action_values, PURCHASE_TYPES) * 100),
  };
}


/** Currencies Meta bills without a minor unit (budgets are whole units, not cents). */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'CLP', 'VND', 'ISK', 'TWD', 'HUF', 'PYG', 'COP', 'IDR']);
export function minorUnits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

export type Perf = { spend_cents: number; results: number; cost_per_result_cents: number | null };

/** Spend and results (leads + purchases) from an `insights` edge, in cents. */
export function parsePerf(insights: { data?: InsightRow[] } | undefined): Perf {
  const row = insights?.data?.[0];
  if (!row) return { spend_cents: 0, results: 0, cost_per_result_cents: null };
  const p = parseMetaInsight(row);
  return { spend_cents: p.spend, results: p.conversions, cost_per_result_cents: p.conversions ? Math.round(p.spend / p.conversions) : null };
}

/**
 * Sanity limits on a budget change made from the dashboard: at least 1.00, and no
 * more than 5x (or below a fifth of) the current budget in one step. Returns an error or null.
 */
export function checkBudgetChange(currentMinor: number | null, nextMinor: number, unit: number): string | null {
  if (!Number.isFinite(nextMinor) || nextMinor < unit) return 'Daily budget must be at least 1.00.';
  if (currentMinor && nextMinor > currentMinor * 5) return 'That is more than 5x the current budget. Raise it in steps, or change it in Ads Manager.';
  if (currentMinor && nextMinor * 5 < currentMinor) return 'That is less than a fifth of the current budget. Pause it instead, or change it in Ads Manager.';
  return null;
}
