import Link from 'next/link';
import { Empty, PageHeader, Panel } from '@/components/ui';
import { CampaignBuilder } from '@/components/ads/CampaignBuilder';
import { listAccounts } from '@/lib/meta/connections';

export const metadata = { title: 'New campaign' };
export const dynamic = 'force-dynamic';

export default async function NewCampaign({ searchParams }: { searchParams: { account?: string } }) {
  const accounts = await listAccounts();
  const account = accounts.find((a) => a.id === searchParams.account) ?? accounts.find((a) => a.client_id) ?? accounts[0];
  return (
    <>
      <div className="mb-2 text-[12px]">
        <Link href={account ? `/ads?account=${account.id}` : '/ads'} className="text-faint hover:text-muted">Ads</Link>
      </div>
      <PageHeader eyebrow={account ? `${account.client_name ?? 'Unlinked'} · ${account.name}` : 'Meta'} title="New campaign" />
      {account ? <CampaignBuilder accountId={account.id} currency={account.currency} /> : <Panel><Empty>Connect a Meta account first.</Empty></Panel>}
    </>
  );
}
