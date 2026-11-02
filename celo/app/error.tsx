'use client';

import { Icon } from '@/components/Icon';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel mx-auto mt-16 max-w-xl p-8">
      <div className="eyebrow flex items-center gap-2 text-bad">
        <Icon name="alert" size={14} /> Something failed
      </div>
      <p className="mt-4 text-sm text-ink">{error.message || 'Unexpected error.'}</p>
      {error.digest && <p className="mt-2 text-xs text-faint">Ref {error.digest}</p>}
      <button onClick={reset} className="btn mt-6">
        Try again
      </button>
    </div>
  );
}
