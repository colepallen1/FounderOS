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

