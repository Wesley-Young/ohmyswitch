import { useQuery } from '@tanstack/react-query';
import { KeyRound, Plus } from 'lucide-react';
import { Link, Navigate } from 'react-router';

import { PageContent } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { trpc } from '@/lib/trpc';

/** With no provider selected: open the first one, or offer to add one. */
export default function ProvidersIndex() {
  const providers = useQuery(trpc.providers.list.queryOptions());
  const [first] = providers.data ?? [];
  if (first) return <Navigate to={`/providers/${first.id}`} replace />;
  // Loading and errors are shown in the list on the left.
  if (!providers.isSuccess) return null;
  return (
    <PageContent>
      <Empty className="border py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRound />
          </EmptyMedia>
          <EmptyTitle>还没有供应商</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link to="/providers/new" />}>
            <Plus data-icon="inline-start" />
            添加供应商
          </Button>
        </EmptyContent>
      </Empty>
    </PageContent>
  );
}
