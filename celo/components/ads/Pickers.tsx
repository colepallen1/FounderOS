'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function AccountPicker({ accounts, current }: { accounts: { id: string; label: string }[]; current: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <select
      aria-label="Ad account"
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(sp);
        next.set('account', e.target.value);
        router.push(`${path}?${next}`);
      }}
      className="field w-auto min-w-[220px] py-2 text-[13px]"
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </select>
  );
}

export function RangePicker({ current }: { current: number }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <div className="flex border border-line" style={{ borderRadius: 'var(--radius)' }} role="group" aria-label="Date range">
      {[7, 14, 30, 90].map((d) => (
        <button
          key={d}
          onClick={() => {
            const next = new URLSearchParams(sp);
            next.set('range', String(d));
            next.delete('since');
            next.delete('until');
            router.push(`${path}?${next}`);
          }}
          aria-pressed={current === d}
          className={`px-3 py-1.5 text-[11.5px] uppercase tracking-[0.12em] ${current === d ? 'bg-accent/15 text-accent-hi' : 'text-faint hover:text-muted'}`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}
