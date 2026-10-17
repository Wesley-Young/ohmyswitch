import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { ProviderFields, type ProviderValues } from '@/components/provider-fields';
import { ModelPickerDialog, ProviderModels } from '@/components/provider-models';
import { Button } from '@/components/ui/button';
import type { Endpoint } from '@/lib/endpoints';
import { formError, trpc } from '@/lib/trpc';

/** Values as sent to the server. A missing endpoint is left for server validation to report on the field. */
export type ProviderPayload = Omit<ProviderValues, 'endpoint'> & { endpoint: Endpoint };

export const toPayload = (values: ProviderValues) => values as ProviderPayload;

/** The full provider form used by the create and edit pages. */
export function ProviderForm({
  initialValues,
  submitLabel,
  pendingLabel,
  isPending,
  error,
  onSubmit,
}: {
  initialValues: ProviderValues;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  error: unknown;
  onSubmit: (values: ProviderValues) => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [picking, setPicking] = useState(false);
  // Field errors shown come from whichever request ran last: saving, or fetching models.
  const [lastAction, setLastAction] = useState<'submit' | 'fetch'>('submit');
  const fetchModels = useMutation(
    trpc.providers.fetchModels.mutationOptions({
      onSuccess: ({ metadataError }) => {
        if (metadataError) toast.warning(`未能补全模型信息：${metadataError}`);
        setPicking(true);
      },
    }),
  );

  const syncModels = useMutation(
    trpc.providers.syncModels.mutationOptions({
      onSuccess: ({ models, unmatched }) => {
        setValues((previous) => ({ ...previous, models }));
        const synced = models.length - unmatched;
        if (!synced) toast.warning('models.dev 中没有找到这些模型');
        else if (unmatched) toast.success(`已同步 ${synced} 个模型，${unmatched} 个未在 models.dev 找到`);
        else toast.success(`已同步 ${synced} 个模型`);
      },
      onError: (failure) => toast.error(formError(failure)?.message),
    }),
  );

  const submitError = formError(error);
  const fetchError = formError(fetchModels.error);
  const shown = lastAction === 'submit' ? submitError : fetchError;
  const fieldError = (field: string) => shown?.fields[field]?.[0];
  const messageOnly = (failure: typeof shown) =>
    failure && !Object.keys(failure.fields).length ? failure.message : undefined;

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        setLastAction('submit');
        fetchModels.reset();
        onSubmit(values);
      }}
    >
      <ProviderFields values={values} onChange={setValues} fieldError={fieldError} />
      <ProviderModels
        models={values.models}
        onChange={(models) => setValues({ ...values, models })}
        fetching={fetchModels.isPending}
        fetchError={lastAction === 'fetch' ? messageOnly(fetchError) : undefined}
        syncing={syncModels.isPending}
        onSync={() => syncModels.mutate({ models: values.models })}
        onFetch={() => {
          setLastAction('fetch');
          const { baseUrl, apiKey, endpoint } = toPayload(values);
          fetchModels.mutate({ baseUrl, apiKey, endpoint });
        }}
      />
      {lastAction === 'submit' && messageOnly(submitError) && (
        <p role="alert" className="text-sm text-destructive">
          {messageOnly(submitError)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link to="/providers" />}>
          取消
        </Button>
      </div>
      <ModelPickerDialog
        open={picking}
        onOpenChange={setPicking}
        remote={fetchModels.data?.models ?? []}
        current={values.models}
        onConfirm={(models) => setValues((previous) => ({ ...previous, models }))}
      />
    </form>
  );
}
