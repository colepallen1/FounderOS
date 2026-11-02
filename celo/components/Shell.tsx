'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, Mark, type IconName } from './Icon';
import { LivePulse } from './LivePulse';
import { ThemeToggle } from './ThemeToggle';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Command', icon: 'command' },
  { href: '/clients', label: 'Clients', icon: 'clients' },
  { href: '/work', label: 'Work', icon: 'work' },
  { href: '/money', label: 'Money', icon: 'money' },
  { href: '/settings', label: 'Integrations', icon: 'plug' },
];

function active(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

export function Shell({ children, theme, authOff, configured, partners = [] }: { children: ReactNode; theme: 'penthouse' | 'cave'; authOff: boolean; configured: boolean; partners?: { name: string; slug: string }[] }) {
  const path = usePathname();
  if (path === '/login') return <>{children}</>;
  return (
    <div className="relative z-10 flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface/70 backdrop-blur lg:flex">
        <Link href="/" className="flex items-center gap-3 px-6 pb-6 pt-7">
          <Mark size={30} />
          <div>
            <div className="display text-[19px] leading-none tracking-[0.18em] text-ink">CELO</div>
            <div className="mt-1 text-[9.5px] uppercase tracking-[0.42em] text-accent">Digital</div>
          </div>
        </Link>
        <div className="mx-6 rule" />
        <nav className="mt-5 flex flex-col gap-0.5 px-3">
          {NAV.map((n) => {
            const on = active(path, n.href) && !(n.href === '/clients' && partners.some((p) => path.startsWith(`/clients/${p.slug}`)));
            const sub =
              n.href === '/clients' &&
              partners.map((p) => {
                const pOn = path === `/clients/${p.slug}` || path.startsWith(`/clients/${p.slug}?`);
                return (
                  <Link
                    key={p.slug}
                    href={`/clients/${p.slug}`}
                    className={`ml-[26px] block truncate border-l py-1.5 pl-3 text-[12.5px] transition-colors ${pOn ? 'border-accent text-ink' : 'border-line text-faint hover:text-muted'}`}
                  >
                    {p.name}
                  </Link>
                );
              });
            return [
              <Link
                key={n.href}
                href={n.href}
                className={`group flex items-center gap-3 border-l-2 px-3 py-2.5 text-[13px] tracking-[0.06em] transition-colors ${on ? 'border-accent bg-accent/[0.07] text-ink' : 'border-transparent text-muted hover:bg-ink/[0.03] hover:text-ink'}`}
              >
                <Icon name={n.icon} size={17} className={on ? 'text-accent' : 'text-faint group-hover:text-muted'} />
                {n.label}
              </Link>,
              sub,
            ];
          })}
        </nav>
        <div className="mt-auto space-y-3 px-6 pb-6">
          <ThemeToggle theme={theme} />
          {!authOff && (
            <form action="/api/auth/logout" method="post">
              <button className="flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-faint hover:text-muted">
                <Icon name="logout" size={14} /> Sign out
              </button>
            </form>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 lg:hidden">
            <Mark size={24} />
            <span className="display text-[15px] tracking-[0.18em]">CELO</span>
          </Link>
          <Clock />
          <div className="flex items-center gap-3">
            <LivePulse configured={configured} />
            <div className="lg:hidden">
              <ThemeToggle theme={theme} compact />
            </div>
          </div>
        </header>
        {authOff && (
          <div className="border-b border-warn/30 bg-warn/[0.06] px-4 py-2 text-[12px] text-warn sm:px-8">
            Local mode: no password is set, so anyone on this machine can open the dashboard. Set CELO_PASSWORD before deploying.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-8 sm:px-8 lg:pb-12">{children}</main>
      </div>

      {/* Phone: bottom tab bar. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.map((n) => {
          const on = active(path, n.href);
          return (
            <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-1 py-2.5 text-[10px] uppercase tracking-[0.1em] ${on ? 'text-accent-hi' : 'text-faint'}`}>
              <Icon name={n.icon} size={19} />
              {n.label === 'Integrations' ? 'Setup' : n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Clock() {
  const now = new Date();
  return (
    <div className="hidden text-[11px] uppercase tracking-[0.24em] text-faint sm:block" suppressHydrationWarning>
      {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
    </div>
  );
}
