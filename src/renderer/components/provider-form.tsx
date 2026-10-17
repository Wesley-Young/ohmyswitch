import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';

import { ProviderFields, type ProviderValues } from '@/components/provider-fields';
import { Button } from '@/components/ui/button';
import type { Endpoint } from '@/lib/endpoints';
import { formError } from '@/lib/trpc';

/** Values as sent to the server. A missing endpoint is left for server validation to report on the field. */
export type ProviderPayload = Omit<ProviderValues, 'endpoint'> & { endpoint: Endpoint };

export const toPayload = (values: ProviderValues) => values as ProviderPayload;

/** The connection form used by the add, edit and import pages. Models are managed on the provider's page. */
export function ProviderForm({
  initialValues,
  endpointOptions,
  children,
  cancelTo,
  onCancel,
  submitLabel,
  pendingLabel,
  isPending,
  error,
  onSubmit,
}: {
  initialValues: ProviderValues;
  endpointOptions?: readonly Endpoint[];
  /** Shown after the fields, before the form error and buttons. */
  children?: ReactNode;
  /** Where 取消 goes. */
  cancelTo: string;
  onCancel?: () => void;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  error: unknown;
  onSubmit: (values: ProviderValues) => void;
}) {
  const [values, setValues] = useState(initialValues);
  const failure = formError(error);
  const formLevelError = failure && !Object.keys(failure.fields).length ? failure.message : undefined;

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <ProviderFields
        values={values}
        onChange={setValues}
        fieldError={(field) => failure?.fields[field]?.[0]}
        endpointOptions={endpointOptions}
      />
      {children}
      {formLevelError && (
        <p role="alert" className="text-sm text-destructive">
          {formLevelError}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link to={cancelTo} onClick={onCancel} />}>
          取消
        </Button>
      </div>
    </form>
  );
}
