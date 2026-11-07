import Link from 'next/link';
import { Empty, PageHeader, Panel } from '@/components/ui';
import { CampaignBuilder } from '@/components/ads/CampaignBuilder';
import { listAccounts } from '@/lib/meta/connections';
import { isReadOnly } from '@/lib/meta/actions';

export const metadata = { title: 'New campaign' };
export const dynamic = 'force-dynamic';

export default async function NewCampaign({ searchParams }: { searchParams: { account?: string } }) {
  const [accounts, readOnly] = await Promise.all([listAccounts(), isReadOnly()]);
  const account = accounts.find((a) => a.id === searchParams.account) ?? accounts.find((a) => a.client_id) ?? accounts[0];
  return (
    <>
      <div className="mb-2 text-[12px]">
        <Link href={account ? `/ads?account=${account.id}` : '/ads'} className="text-faint hover:text-muted">Ads</Link>
      </div>
      <PageHeader eyebrow={account ? `${account.client_name ?? 'Unlinked'} · ${account.name}` : 'Meta'} title="New campaign" />
      {readOnly ? <Panel><Empty>Read-only mode is on, so campaigns are created in Ads Manager. Turn it off under Ads → Connections to build campaigns here.</Empty></Panel> : account ? <CampaignBuilder accountId={account.id} currency={account.currency} /> : <Panel><Empty>Connect a Meta account first.</Empty></Panel>}
    </>
  );
}
