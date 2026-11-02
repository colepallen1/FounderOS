import { ClientFields } from '@/components/ClientFields';
import { Icon } from '@/components/Icon';
import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/actions';

export const metadata = { title: 'New client' };

export default function NewClient() {
  return (
    <>
      <PageHeader eyebrow="Clients" title="New client" />
      <form action={createClient} className="panel max-w-3xl space-y-6 p-6">
        <ClientFields />
        <p className="text-[12.5px] text-muted">Stripe customers, ad accounts and email domains can be linked on the client page once it exists.</p>
        <button className="btn">
          <Icon name="plus" size={14} /> Create client
        </button>
      </form>
    </>
  );
}
