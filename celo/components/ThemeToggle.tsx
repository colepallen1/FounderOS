'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setTheme } from '@/lib/actions';

const LABEL = { penthouse: 'Penthouse', cave: 'Cave' } as const;

export function ThemeToggle({ theme, compact }: { theme: 'penthouse' | 'cave'; compact?: boolean }) {
  const [, start] = useTransition();
  const router = useRouter();
  const flip = (next: 'penthouse' | 'cave') => {
    document.documentElement.dataset.theme = next;
    start(async () => {
      await setTheme(next);
      router.refresh();
    });
  };
  if (compact) {
    const next = theme === 'penthouse' ? 'cave' : 'penthouse';
    return (
      <button onClick={() => flip(next)} className="btn-ghost px-2.5 py-1.5" aria-label={`Switch to ${LABEL[next]} theme`}>
        {LABEL[theme]}
      </button>
    );
  }
  return (
    <div>
      <div className="eyebrow mb-2">Theme</div>
      <div className="grid grid-cols-2 border border-line" style={{ borderRadius: 'var(--radius)' }}>
        {(['penthouse', 'cave'] as const).map((t) => (
          <button
            key={t}
            onClick={() => flip(t)}
            aria-pressed={theme === t}
            className={`py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors ${theme === t ? 'bg-accent/15 text-accent-hi' : 'text-faint hover:text-muted'}`}
          >
            {LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
