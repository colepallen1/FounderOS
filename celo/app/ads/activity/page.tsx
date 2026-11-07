import Link from 'next/link';
import { Badge, Empty, PageHeader, Panel } from '@/components/ui';
import { ApprovalQueue } from '@/components/ads/ApprovalQueue';
import { listActions } from '@/lib/meta/actions';

export const metadata = { title: 'Ads activity' };
export const dynamic = 'force-dynamic';

const TONE = { executed: 'good', failed: 'bad', rejected: 'muted', approved: 'accent', pending: 'warn' } as const;

export default async function Activity() {
  const [pending, history] = await Promise.all([listActions({ status: ['pending'] }), listActions({ status: ['executed', 'failed', 'rejected', 'approved'], limit: 150 })]);
  return (
    <>
      <div className="mb-2 text-[12px]">
        <Link href="/ads" className="text-faint hover:text-muted">Ads</Link>
      </div>
      <PageHeader eyebrow="Every change to Meta, proposed and decided" title="Approvals" />
      <Panel title={`Waiting · ${pending.length}`} icon="check">
        <ApprovalQueue actions={pending} />
      </Panel>
      <Panel title="History" icon="clock" className="mt-4" pad={false}>
        {history.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Change</th>
                  <th>Client</th>
                  <th>From</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-[12.5px] text-muted">{new Date(a.executed_at ?? a.decided_at ?? a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="max-w-[420px]">
                      <div className="text-[13.5px]">{a.summary}</div>
                      {a.error && <div className="text-[12px] text-bad">{a.error}</div>}
                    </td>
                    <td className="text-[13px] text-muted">{a.client_name ?? '-'}</td>
                    <td className="text-[12px] capitalize text-muted">{a.source}</td>
                    <td><Badge tone={TONE[a.status]}>{a.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><Empty>No changes yet.</Empty></div>
        )}
      </Panel>
    </>
  );
}
