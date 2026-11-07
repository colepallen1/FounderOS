'use client';

import { useState, useTransition } from 'react';
import { createShareLink } from '@/lib/meta/report-actions';
import { Icon } from '../Icon';

export function ReportControls({ slug, csvHref }: { slug: string; csvHref: string }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <a href={csvHref} className="btn-ghost">
        <Icon name="note" size={13} /> CSV
      </a>
      <button onClick={() => window.print()} className="btn-ghost">
        <Icon name="external" size={13} /> Print / PDF
      </button>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const t = await createShareLink(slug);
            const url = `${window.location.origin}/r/${t}`;
            setLink(url);
            navigator.clipboard?.writeText(url).catch(() => undefined);
          })
        }
        className="btn"
      >
        <Icon name="globe" size={13} /> Share link
      </button>
      {link && (
        <span className="w-full text-[12px] text-muted">
          Copied. Read-only, this client only, expires in 30 days: <code className="break-all text-accent-hi">{link}</code>
        </span>
      )}
    </div>
  );
}
