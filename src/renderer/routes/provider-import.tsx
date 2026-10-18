import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { FormSkeleton } from '@/components/form-skeleton';
import { useHarnessFeedback } from '@/components/harness-feedback';
import { PageContent, PageHeader } from '@/components/page';
import type { ProviderValues } from '@/components/provider-fields';
import { ProviderForm, toPayload } from '@/components/provider-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { refreshProviders } from '@/lib/cache';
import { endpoints } from '@/lib/endpoints';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type Pending = NonNullable<RouterOutputs['deepLinks']['pending']>;
type Match = NonNullable<Pending['match']>;

/** Model ids shown before the rest are summarized as a count. */
const shownModels = 24;

export default function ProviderImport() {
  const pending = useQuery(trpc.deepLinks.pending.queryOptions(undefined, { staleTime: 0 }));

  return (
    <>
      <PageHeader title="导入供应商" backTo="/providers" />
      <PageContent>
        {pending.isPending ? (
          <FormSkeleton />
        ) : pending.isError ? (
          <ErrorRow error={pending.error} onRetry={() => pending.refetch()} />
        ) : pending.data ? (
          // A newer link replaces the pending import; keying resets the form to it.
          <ImportForm key={pending.data.id} pending={pending.data} />
        ) : (
          // Nothing to import, such as after the import was handled.
          <Navigate to="/providers" replace />
        )}
      </PageContent>
    </>
  );
}

function ImportForm({ pending }: { pending: Pending }) {
  const { match } = pending;
  const [mode, setMode] = useState<'update' | 'create'>(match ? 'update' : 'create');
  // Called after leaving the page. The cached pending import is not refreshed here: that would redirect this
  // page while it navigates elsewhere, and the page reloads it whenever it mounts.
  const dismiss = useMutation(trpc.deepLinks.dismiss.mutationOptions());
  const done = () => dismiss.mutate({ id: pending.id });

  return (
    <div className="grid gap-6">
      {match && (
        <RadioGroup
          aria-label="导入方式"
          className="gap-2.5"
          value={mode}
          onValueChange={(value) => setMode(value as typeof mode)}
        >
          <Field orientation="horizontal">
            <RadioGroupItem id="import-update" value="update" />
            <FieldLabel htmlFor="import-update" className="min-w-0 font-normal">
              <span className="truncate">更新「{match.name}」</span>
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem id="import-create" value="create" />
            <FieldLabel htmlFor="import-create" className="font-normal">
              添加为新供应商
            </FieldLabel>
          </Field>
        </RadioGroup>
      )}
      {match && mode === 'update' ? (
        <UpdateForm pending={pending} match={match} onDone={done} />
      ) : (
        <CreateForm pending={pending} onDone={done} />
      )}
    </div>
  );
}

/** The endpoints the link lists, or all of them when it listed none ohmyswitch knows. */
const endpointOptionsOf = (pending: Pending) => (pending.draft.endpoints.length ? pending.draft.endpoints : endpoints);

function CreateForm({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const navigate = useNavigate();
  const { draft } = pending;
  const create = useMutation(
    trpc.providers.create.mutationOptions({
      onSuccess: async (provider) => {
        await refreshProviders();
        toast.success(`已添加「${provider.name}」`);
        navigate(`/providers/${provider.id}`);
        onDone();
      },
    }),
  );
  const initialValues: ProviderValues = {
    name: draft.name,
    baseUrl: draft.baseUrl,
    apiKey: draft.apiKey,
    endpoint: endpointOptionsOf(pending)[0],
    iconUrl: draft.iconUrl,
  };

  return (
    <ProviderForm
      initialValues={initialValues}
      endpointOptions={endpointOptionsOf(pending)}
      cancelTo="/providers"
      onCancel={onDone}
      submitLabel="添加"
      pendingLabel="正在添加…"
      isPending={create.isPending}
      error={create.error}
      onSubmit={(values) => create.mutate({ ...toPayload(values), modelIds: draft.modelIds })}
    >
      {draft.modelIds.length > 0 && <ModelIds ids={draft.modelIds} />}
    </ProviderForm>
  );
}

/**
 * Updating keeps the provider's name and models; the link's Base URL replaces the saved one, and its API key
 * and icon do when it has them.
 */
function UpdateForm({ pending, match, onDone }: { pending: Pending; match: Match; onDone: () => void }) {
  const navigate = useNavigate();
  const report = useHarnessFeedback();
  const connection = useQuery(
    trpc.providers.connection.queryOptions({ providerId: match.providerId }, { staleTime: 0 }),
  );
  const update = useMutation(
    trpc.providers.update.mutationOptions({
      onSuccess: async (saved) => {
        await refreshProviders();
        report(`已更新「${saved.name}」`, saved);
        navigate(`/providers/${saved.id}`);
        onDone();
      },
    }),
  );

  if (connection.isPending) return <FormSkeleton />;
  if (connection.isError) return <ErrorRow error={connection.error} onRetry={() => connection.refetch()} />;

  const { draft } = pending;
  const initialValues: ProviderValues = {
    name: connection.data.name,
    baseUrl: draft.baseUrl,
    apiKey: draft.apiKey || connection.data.apiKey,
    endpoint: match.endpoint,
    iconUrl: draft.iconUrl || connection.data.iconUrl,
  };

  return (
    <ProviderForm
      initialValues={initialValues}
      endpointOptions={endpointOptionsOf(pending)}
      cancelTo="/providers"
      onCancel={onDone}
      submitLabel="更新"
      pendingLabel="正在更新…"
      isPending={update.isPending}
      error={update.error}
      onSubmit={(values) => update.mutate({ providerId: match.providerId, ...toPayload(values) })}
    />
  );
}

function ModelIds({ ids }: { ids: string[] }) {
  const rest = ids.length - shownModels;
  return (
    <FieldSet>
      <FieldLegend variant="label">模型</FieldLegend>
      <div className="flex flex-wrap gap-1.5">
        {ids.slice(0, shownModels).map((id) => (
          <Badge key={id} variant="outline" className="max-w-60 font-mono" title={id}>
            <span className="truncate">{id}</span>
          </Badge>
        ))}
        {rest > 0 && <Badge variant="secondary">还有 {rest} 个</Badge>}
      </div>
    </FieldSet>
  );
}

function ErrorRow({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm">
      <span className="text-destructive">{formError(error)?.message}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}
