import { notFound } from 'next/navigation';
import { Mark } from '@/components/Icon';
import { ClientReport } from '@/components/ads/ClientReport';
import { one } from '@/lib/db';
import { todayInTz } from '@/lib/queries';
import { parseRange } from '@/lib/meta/data';
import { clientReport, readShareToken } from '@/lib/meta/report';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Performance report', robots: { index: false, follow: false } };

/** Public, read-only, one client. The token is signed per client and expires. */
export default async function SharedReport({ params, searchParams }: { params: { token: string }; searchParams: { range?: string } }) {
  const clientId = await readShareToken(params.token);
  if (!clientId) notFound();
  const c = await one<{ name: string }>(`SELECT name FROM clients WHERE id = $1`, [clientId]);
  if (!c) notFound();
  const range = parseRange({ range: searchParams.range ?? '30' }, todayInTz());
  const d = await clientReport(clientId, range);
  return (
    <div className="relative z-10 mx-auto max-w-[1100px] px-4 py-10 sm:px-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Performance report · {range.label}</div>
          <h1 className="display mt-2 text-3xl text-ink sm:text-[40px]">{c.name}</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <Mark size={26} />
          <span className="display tracking-[0.18em]">CELO</span>
        </div>
      </header>
      {d ? <ClientReport d={d} clientName={c.name} /> : <p className="text-muted">No data yet.</p>}
      <p className="mt-8 text-center text-[11px] uppercase tracking-[0.3em] text-faint">Prepared by Celo Digital</p>
    </div>
  );
}
