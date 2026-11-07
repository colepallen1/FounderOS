'use client';

import { useState, useTransition } from 'react';
import { previewAd } from '@/lib/meta/ui-actions';
import { Badge } from '../ui';
import { cur, num, pct } from './fmt';

export type CreativeRow = { id: string; name: string; campaign: string; thumbnail: string | null; title: string; body: string; status: string; spend: number; results: number; cpa: number | null; ctr: number | null; frequency: number | null; fatigue: 'fatigued' | 'declining' | 'ok' | 'unknown'; fatigue_note: string };

const FORMATS = [
  { id: 'MOBILE_FEED_STANDARD', label: 'Facebook feed' },
  { id: 'INSTAGRAM_STANDARD', label: 'Instagram feed' },
  { id: 'INSTAGRAM_STORY', label: 'Instagram stories' },
];

export function CreativeBoard({ accountId, currency, rows }: { accountId: string; currency: string; rows: CreativeRow[] }) {
  const [preview, setPreview] = useState<{ id: string; format: string; src: string | null; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const open = (id: string, format: string) =>
    start(async () => {
      const r = await previewAd(accountId, id, format);
      setPreview(r.ok ? { id, format, src: r.data ?? null } : { id, format, src: null, error: r.error });
    });
  if (!rows.length) return <div className="p-5 text-center text-sm text-faint">No ads with spend in this period.</div>;
  return (
    <div className="divide-y divide-line/60">
      {rows.map((r, i) => (
        <div key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
          <span className="num w-6 text-[15px] text-faint">{i + 1}</span>
          {r.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.thumbnail} alt="" className="h-14 w-14 shrink-0 border border-line object-cover" style={{ borderRadius: 'var(--radius)' }} />
          ) : (
            <span className="h-14 w-14 shrink-0 border border-line bg-raised" style={{ borderRadius: 'var(--radius)' }} />
          )}
          <div className="min-w-[180px] flex-1">
            <div className="truncate text-[14px] text-ink" title={r.name}>{r.name}</div>
            <div className="truncate text-[11.5px] text-faint">{r.campaign}{r.title ? ` · ${r.title}` : ''}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {r.fatigue === 'fatigued' && <Badge tone="bad" icon="alert">Fatigued</Badge>}
              {r.fatigue === 'declining' && <Badge tone="warn">CTR declining</Badge>}
              {r.status !== 'ACTIVE' && <Badge tone="muted">{r.status.toLowerCase()}</Badge>}
            </div>
          </div>
          <dl className="grid grid-cols-5 gap-4 text-right">
            {[['Spend', cur(r.spend, currency)], ['Results', num(r.results, 1)], ['Per result', cur(r.cpa, currency)], ['CTR', pct(r.ctr)], ['Freq.', r.frequency == null ? '-' : r.frequency.toFixed(2)]].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="num mt-1 text-[14px]">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-1">
            {FORMATS.map((f) => (
              <button key={f.id} onClick={() => open(r.id, f.id)} disabled={pending} className="btn-ghost px-2 py-1 text-[10px]" title={`Preview: ${f.label}`}>
                {f.label.split(' ')[0] === 'Facebook' ? 'FB' : f.id === 'INSTAGRAM_STORY' ? 'Story' : 'IG'}
              </button>
            ))}
          </div>
          {r.fatigue_note && <p className="w-full pl-10 text-[11.5px] text-faint">{r.fatigue_note}</p>}
        </div>
      ))}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={() => setPreview(null)}>
          <div className="panel bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-6">
              <span className="eyebrow">Preview from Meta · {FORMATS.find((f) => f.id === preview.format)?.label}</span>
              <button onClick={() => setPreview(null)} className="link text-[12px]">Close</button>
            </div>
            {preview.src ? <iframe src={preview.src} title="Ad preview" className="h-[560px] w-[340px] border-0 bg-white" /> : <p className="max-w-sm text-[13px] text-bad">{preview.error ?? 'Meta returned no preview for this placement.'}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
