import { describe, expect, it } from 'vitest';
import { describeRule, dueOccurrences, nextOccurrence } from '@/lib/recurring';

describe('nextOccurrence', () => {
  it('weekly lands on the anchor weekday, today included', () => {
    // 2026-11-02 is a Monday
    expect(nextOccurrence('weekly', 1, '2026-11-02')).toBe('2026-11-02');
    expect(nextOccurrence('weekly', 5, '2026-11-02')).toBe('2026-11-06');
    expect(nextOccurrence('weekly', 0, '2026-11-02')).toBe('2026-11-08');
  });
  it('monthly rolls to next month once passed and clamps short months', () => {
    expect(nextOccurrence('monthly', 15, '2026-11-02')).toBe('2026-11-15');
    expect(nextOccurrence('monthly', 1, '2026-11-02')).toBe('2026-12-01');
    expect(nextOccurrence('monthly', 31, '2027-02-10')).toBe('2027-02-28');
    expect(nextOccurrence('monthly', 31, '2026-11-30')).toBe('2026-11-30');
  });
});

describe('dueOccurrences', () => {
  it('first run creates only the next occurrence in the window', () => {
    expect(dueOccurrences('weekly', 3, '2026-11-02', null)).toEqual(['2026-11-04']);
    expect(dueOccurrences('monthly', 20, '2026-11-02', null)).toEqual([]);
  });
  it('never repeats an occurrence already generated', () => {
    expect(dueOccurrences('weekly', 3, '2026-11-02', '2026-11-04')).toEqual([]);
    expect(dueOccurrences('weekly', 3, '2026-11-06', '2026-11-04')).toEqual(['2026-11-11']);
  });
  it('catches up missed occurrences after a gap', () => {
    expect(dueOccurrences('weekly', 1, '2026-11-16', '2026-11-02')).toEqual(['2026-11-09', '2026-11-16', '2026-11-23'].filter((d) => d <= '2026-11-22'));
  });
  it('describes rules', () => {
    expect(describeRule('weekly', 1)).toBe('Every Monday');
    expect(describeRule('monthly', 1)).toBe('Monthly on the 1st');
    expect(describeRule('monthly', 22)).toBe('Monthly on the 22nd');
    expect(describeRule('monthly', 11)).toBe('Monthly on the 11th');
  });
});

import { duePayments, nextPaymentDate, PAY_CADENCES } from '@/lib/recurring';

describe('recurring payments', () => {
  it('steps weekly, biweekly and monthly (month-end safe)', () => {
    expect(nextPaymentDate('2026-11-02', PAY_CADENCES.biweekly, 2)).toBe('2026-11-16');
    expect(nextPaymentDate('2026-11-02', PAY_CADENCES.weekly, 2)).toBe('2026-11-09');
    expect(nextPaymentDate('2027-01-31', PAY_CADENCES.monthly, 31)).toBe('2027-02-28');
    expect(nextPaymentDate('2027-02-28', PAY_CADENCES.monthly, 31)).toBe('2027-03-31');
  });
  it('logs every missed date once and returns the next', () => {
    expect(duePayments('2026-11-02', '2026-11-01', PAY_CADENCES.monthly, 2)).toEqual({ due: [], next: '2026-11-02' });
    expect(duePayments('2026-09-02', '2026-11-02', PAY_CADENCES.monthly, 2)).toEqual({ due: ['2026-09-02', '2026-10-02', '2026-11-02'], next: '2026-12-02' });
  });
});
