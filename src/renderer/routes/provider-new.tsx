import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { PageContent, PageHeader } from '@/components/page';
import { emptyProviderValues } from '@/components/provider-fields';
import { ProviderForm, toPayload } from '@/components/provider-form';
import { refreshProviders } from '@/lib/cache';
import { trpc } from '@/lib/trpc';

export default function ProviderNew() {
  const navigate = useNavigate();
  const create = useMutation(
    trpc.providers.create.mutationOptions({
      onSuccess: async (provider) => {
        await refreshProviders();
        toast.success(`已添加「${provider.name}」`);
        navigate(`/providers/${provider.id}`);
      },
    }),
  );

  return (
    <>
      <PageHeader title="添加供应商" backTo="/providers" />
      <PageContent>
        <ProviderForm
          cancelTo="/providers"
          initialValues={emptyProviderValues}
          submitLabel="添加"
          pendingLabel="正在添加…"
          isPending={create.isPending}
          error={create.error}
          onSubmit={(values) => create.mutate(toPayload(values))}
        />
      </PageContent>
    </>
  );
}
