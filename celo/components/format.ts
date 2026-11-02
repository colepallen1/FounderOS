import { TZ } from '@/lib/config';

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString('en-US', { timeZone: /^\d{4}-\d{2}-\d{2}$/.test(iso) ? 'UTC' : TZ, ...opts });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtNum(n: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, notation: Math.abs(n) >= 100000 ? 'compact' : 'standard' }).format(n);
}

/** "in 3 days", "today", "2 days ago" for ISO day strings relative to `today`. */
export function relDay(day: string, today: string): string {
  const diff = Math.round((new Date(`${day}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff}d` : `${-diff}d late`;
}
