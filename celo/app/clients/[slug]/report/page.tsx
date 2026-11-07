import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Empty, PageHeader, Panel } from '@/components/ui';
import { ClientReport } from '@/components/ads/ClientReport';
import { ReportControls } from '@/components/ads/ReportControls';
import { RangePicker } from '@/components/ads/Pickers';
import { getClientBySlug, todayInTz } from '@/lib/queries';
import { parseRange } from '@/lib/meta/data';
import { clientReport } from '@/lib/meta/report';

export const dynamic = 'force-dynamic';

export default async function ReportPage({ params, searchParams }: { params: { slug: string }; searchParams: { range?: string; since?: string; until?: string } }) {
  const c = await getClientBySlug(params.slug);
  if (!c) notFound();
  const range = parseRange({ range: searchParams.range ?? '30', since: searchParams.since, until: searchParams.until }, todayInTz());
  const d = await clientReport(c.id, range);
  return (
    <>
      <div className="no-print mb-2 text-[12px]">
        <Link href={`/clients/${c.slug}?tab=ads`} className="text-faint hover:text-muted">{c.name}</Link>
      </div>
      <PageHeader eyebrow={`Performance report · ${range.label}`} title={c.name}>
        <div className="no-print"><RangePicker current={range.days} /></div>
      </PageHeader>
      <div className="mb-4">
        <ReportControls slug={c.slug} csvHref={`/api/report/csv?client=${c.slug}&since=${range.since}&until=${range.until}`} />
      </div>
      {d ? <ClientReport d={d} clientName={c.name} /> : <Panel><Empty>No Meta ad account is linked to {c.name}. Link one under Ads → Connections.</Empty></Panel>}
    </>
  );
}
