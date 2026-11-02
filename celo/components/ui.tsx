import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="display truncate text-3xl text-ink sm:text-[40px] sm:leading-[1.1]">{title}</h1>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      <div className="rule mt-5" />
    </header>
  );
}

export function Panel({ title, icon, action, children, className = '', pad = true }: { title?: ReactNode; icon?: IconName; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3.5">
          <h2 className="eyebrow flex items-center gap-2 text-muted">
            {icon && <Icon name={icon} size={14} className="text-accent" />}
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad'; href?: string }) {
  const body = (
    <div className="panel h-full p-5 transition-colors hover:border-accent/40">
      <div className="eyebrow">{label}</div>
      <div className={`num mt-3 text-[34px] leading-none sm:text-[40px] ${tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</div>
      {sub && <div className="mt-3 text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

const TONES: Record<string, string> = {
  good: 'text-good border-good/40 bg-good/10',
  warn: 'text-warn border-warn/40 bg-warn/10',
  bad: 'text-bad border-bad/40 bg-bad/10',
  accent: 'text-accent-hi border-accent/40 bg-accent/10',
  muted: 'text-muted border-line bg-ink/[0.02]',
};

export function Badge({ tone = 'muted', children, icon }: { tone?: keyof typeof TONES; children: ReactNode; icon?: IconName }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.12em] ${TONES[tone]}`} style={{ borderRadius: 'var(--radius)' }}>
      {icon && <Icon name={icon} size={11} strokeWidth={2} />}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, keyof typeof TONES> = {
  active: 'good',
  onboarding: 'accent',
  paused: 'warn',
  churned: 'muted',
  paid: 'good',
  failed: 'bad',
  refunded: 'warn',
  pending: 'muted',
  past_due: 'bad',
  trialing: 'accent',
  canceled: 'muted',
  incomplete: 'warn',
  unpaid: 'bad',
};

/** The honest empty state for anything that depends on an integration. */
export function NotConfigured({ what, href = '/settings' }: { what: string; href?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
      <Badge tone="muted" icon="plug">
        Not configured
      </Badge>
      <span>{what} is not connected yet.</span>
      <Link href={href} className="link inline-flex items-center gap-1">
        Set up <Icon name="arrowRight" size={13} />
      </Link>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-sm text-faint">{children}</div>;
}

export function Tabs({ tabs, current, base }: { tabs: { id: string; label: string; count?: number }[]; current: string; base: string }) {
  return (
    <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => {
        const on = t.id === current;
        return (
          <Link
            key={t.id}
            href={t.id === tabs[0].id ? base : `${base}?tab=${t.id}`}
            className={`relative -mb-px whitespace-nowrap border-b px-3.5 py-2.5 text-[12px] font-medium uppercase tracking-[0.16em] transition-colors ${on ? 'border-accent text-accent-hi' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className="num ml-1.5 text-faint">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
