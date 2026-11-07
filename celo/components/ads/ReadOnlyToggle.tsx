'use client';

import { useTransition } from 'react';
import { setReadOnly } from '@/lib/meta/ui-actions';

export function ReadOnlyToggle({ on }: { on: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (on && !confirm('Turn read-only mode off? Approved changes will then be sent to Meta and can affect live spend.')) return;
        start(() => setReadOnly(!on));
      }}
      className={on ? 'btn' : 'btn-ghost'}
    >
      {on ? 'Read-only: ON' : 'Read-only: OFF'}
    </button>
  );
}
