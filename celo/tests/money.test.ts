import { describe, expect, it } from 'vitest';
import { countsTowardMrr, formatMoney, itemsMrrCents, monthSeries, parseAmountToCents, pctChange } from '@/lib/money';

const price = (unit_amount: number, interval: 'day' | 'week' | 'month' | 'year', interval_count = 1) => ({ unit_amount, recurring: { interval, interval_count } });

describe('itemsMrrCents', () => {
  it('normalises every interval to a month', () => {
    expect(itemsMrrCents([{ price: price(300000, 'month') }])).toBe(300000);
    expect(itemsMrrCents([{ price: price(1200000, 'year') }])).toBe(100000);
    expect(itemsMrrCents([{ price: price(90000, 'month', 3) }])).toBe(30000);
    expect(itemsMrrCents([{ price: price(10000, 'week') }])).toBe(43333);
  });
  it('multiplies by quantity and sums items', () => {
    expect(itemsMrrCents([{ price: price(50000, 'month'), quantity: 2 }, { price: price(25000, 'month') }])).toBe(125000);
  });
  it('ignores one-off and metered prices', () => {
    expect(itemsMrrCents([{ price: { unit_amount: 5000, recurring: null } }, { price: { unit_amount: null, recurring: { interval: 'month', interval_count: 1 } } }])).toBe(0);
  });
});

describe('Celo Digital live book (2026-11-02)', () => {
  it('five active retainers, three of them biweekly, come to about $9,698 MRR', () => {
    const subs = [price(175000, 'month'), price(75000, 'week', 2), price(20000, 'week', 2), price(258000, 'week', 2), price(30000, 'month')];
    const total = subs.reduce((s, p) => s + itemsMrrCents([{ price: p }]), 0);
    expect(total).toBe(969833);
    expect(itemsMrrCents([{ price: price(258000, 'week', 2) }])).toBe(559000);
  });
});

describe('status and parsing', () => {
  it('counts active and past_due toward MRR only', () => {
    expect(['active', 'past_due', 'trialing', 'canceled', 'unpaid'].map(countsTowardMrr)).toEqual([true, true, false, false, false]);
  });
  it('parses typed amounts', () => {
    expect(parseAmountToCents('$1,250.50')).toBe(125050);
    expect(parseAmountToCents('3500')).toBe(350000);
    expect(parseAmountToCents('0')).toBeNull();
    expect(parseAmountToCents('12.345')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
  });
  it('formats money', () => {
    expect(formatMoney(350000)).toBe('$3,500');
    expect(formatMoney(1250000, 'usd', { compact: true })).toBe('$12.5K');
    expect(formatMoney(125050, 'usd', { cents: true })).toBe('$1,250.50');
  });
  it('pctChange is null without a base', () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(150, 100)).toBe(50);
  });
});

describe('monthSeries', () => {
  it('returns n months oldest first, zero filled', () => {
    const s = monthSeries(new Map([['2026-11', 500], ['2026-01', 100]]), new Date(Date.UTC(2026, 10, 15)), 12);
    expect(s).toHaveLength(12);
    expect(s[0].key).toBe('2025-12');
    expect(s[11]).toMatchObject({ key: '2026-11', label: 'Nov', cents: 500 });
    expect(s[1]).toMatchObject({ key: '2026-01', cents: 100 });
    expect(s[5].cents).toBe(0);
  });
});
