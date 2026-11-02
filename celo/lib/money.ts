/** Pure money helpers. No I/O, so they are unit tested directly. */

export type PriceLike = {
  unit_amount: number | null;
  recurring: { interval: 'day' | 'week' | 'month' | 'year'; interval_count: number } | null;
};
export type ItemLike = { price: PriceLike; quantity?: number | null };

const PER_MONTH: Record<string, number> = { day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12 };

/** Monthly recurring revenue of one subscription's items, in cents. Discounts and tax are not applied. */
export function itemsMrrCents(items: ItemLike[]): number {
  let total = 0;
  for (const it of items) {
    const p = it.price;
    if (!p?.recurring || p.unit_amount == null) continue;
    const factor = PER_MONTH[p.recurring.interval] / Math.max(1, p.recurring.interval_count || 1);
    total += p.unit_amount * (it.quantity ?? 1) * factor;
  }
  return Math.round(total);
}

/** Subscription statuses that count toward MRR. past_due still counts (and is flagged as at risk). */
export function countsTowardMrr(status: string): boolean {
  return status === 'active' || status === 'past_due';
}

export function formatMoney(cents: number, currency = 'usd', opts: { compact?: boolean; cents?: boolean } = {}): string {
  const value = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    notation: opts.compact && Math.abs(value) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: opts.cents ? 2 : opts.compact ? 1 : 0,
    minimumFractionDigits: opts.cents ? 2 : 0,
  }).format(value);
}

/** Parse a user-typed amount ("1,250", "$1250.50") into cents. Returns null if not a positive number. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return cents > 0 ? cents : null;
}

export type MonthBucket = { key: string; label: string; cents: number };

/** Last `n` calendar months ending with the month of `now`, oldest first, filled from (month key -> cents). */
export function monthSeries(totals: Map<string, number>, now: Date, n = 12): MonthBucket[] {
  const out: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), cents: totals.get(key) ?? 0 });
  }
  return out;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** "$2,580 every 2 weeks", "$1,750 / month", "$12,000 / year" from stored billing items. */
export function billingLabel(items: { amount_cents: number; interval: string; interval_count: number }[], currency = 'usd'): string {
  return items
    .map((i) => {
      const n = Math.max(1, i.interval_count || 1);
      const amt = formatMoney(i.amount_cents, currency, { cents: i.amount_cents % 100 !== 0 });
      return n === 1 ? `${amt} / ${i.interval}` : `${amt} every ${n} ${i.interval}s`;
    })
    .join(' + ');
}
