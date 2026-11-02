/**
 * Recurring task schedule. Pure date math on ISO day strings (YYYY-MM-DD, UTC).
 *  - weekly: anchor = weekday 0 (Sun) .. 6 (Sat)
 *  - monthly: anchor = day of month 1..31 (clamped to the month's last day)
 */
export type Cadence = 'weekly' | 'monthly';

export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parse(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}
function addDays(day: string, n: number): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** First occurrence on or after `from`. */
export function nextOccurrence(cadence: Cadence, anchor: number, from: string): string {
  const d = parse(from);
  if (cadence === 'weekly') {
    const delta = (anchor - d.getUTCDay() + 7) % 7;
    return addDays(from, delta);
  }
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const thisMonth = Date.UTC(y, m, Math.min(anchor, daysInMonth(y, m)));
  if (thisMonth >= d.getTime()) return toDay(new Date(thisMonth));
  return toDay(new Date(Date.UTC(y, m + 1, Math.min(anchor, daysInMonth(y, m + 1)))));
}

/**
 * Occurrences that should exist as tasks now: every occurrence in (lastGenerated, today + leadDays].
 * The first time a rule runs (lastGenerated null) only the next upcoming one is created, never a backlog.
 */
export function dueOccurrences(cadence: Cadence, anchor: number, today: string, lastGenerated: string | null, leadDays = 6): string[] {
  const horizon = addDays(today, leadDays);
  const out: string[] = [];
  let cursor = lastGenerated ? addDays(lastGenerated, 1) : today;
  for (let guard = 0; guard < 60; guard++) {
    const occ = nextOccurrence(cadence, anchor, cursor);
    if (occ > horizon) break;
    out.push(occ);
    cursor = addDays(occ, 1);
  }
  return out;
}

export function describeRule(cadence: Cadence, anchor: number): string {
  if (cadence === 'weekly') return `Every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][anchor]}`;
  const sfx = anchor % 10 === 1 && anchor !== 11 ? 'st' : anchor % 10 === 2 && anchor !== 12 ? 'nd' : anchor % 10 === 3 && anchor !== 13 ? 'rd' : 'th';
  return `Monthly on the ${anchor}${sfx}`;
}
