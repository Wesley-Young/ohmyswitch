import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { refreshProviders } from '@/lib/cache';
import { type Endpoint, endpointLabels, endpoints } from '@/lib/endpoints';
import { formError, trpc } from '@/lib/trpc';

export function CreateProviderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <CreateProviderForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so every opening starts from an empty form. */
function CreateProviderForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [selected, setSelected] = useState<Endpoint[]>(['/v1/chat/completions']);
  const create = useMutation(
    trpc.providers.create.mutationOptions({
      onSuccess: async (provider) => {
        await refreshProviders();
        toast.success(`已添加「${provider.name}」`);
        onDone();
      },
    }),
  );
  const error = formError(create.error);
  const fieldError = (field: string) => error?.fields[field]?.[0];
  const formLevelError = error && !Object.keys(error.fields).length ? error.message : undefined;

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({ name, baseUrl, apiKey, endpoints: selected });
      }}
    >
      <DialogHeader>
        <DialogTitle>添加供应商</DialogTitle>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(fieldError('name'))}>
          <FieldLabel htmlFor="provider-name">名称</FieldLabel>
          <Input
            id="provider-name"
            value={name}
            maxLength={128}
            autoFocus
            aria-invalid={Boolean(fieldError('name'))}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldError>{fieldError('name')}</FieldError>
        </Field>
        <Field data-invalid={Boolean(fieldError('baseUrl'))}>
          <FieldLabel htmlFor="provider-base-url">Base URL</FieldLabel>
          <Input
            id="provider-base-url"
            className="font-mono"
            placeholder="https://api.example.com"
            value={baseUrl}
            aria-invalid={Boolean(fieldError('baseUrl'))}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
          <FieldError>{fieldError('baseUrl')}</FieldError>
        </Field>
        <Field data-invalid={Boolean(fieldError('apiKey'))}>
          <FieldLabel htmlFor="provider-api-key">API Key</FieldLabel>
          <Input
            id="provider-api-key"
            type="password"
            className="font-mono"
            autoComplete="off"
            value={apiKey}
            aria-invalid={Boolean(fieldError('apiKey'))}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <FieldError>{fieldError('apiKey')}</FieldError>
        </Field>
        <FieldSet data-invalid={Boolean(fieldError('endpoints'))}>
          <FieldLegend variant="label">端点</FieldLegend>
          <FieldGroup className="gap-2.5">
            {endpoints.map((endpoint) => (
              <Field key={endpoint} orientation="horizontal">
                <Checkbox
                  id={`endpoint-${endpoint}`}
                  checked={selected.includes(endpoint)}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      checked ? [...current, endpoint] : current.filter((item) => item !== endpoint),
                    )
                  }
                />
                <FieldLabel htmlFor={`endpoint-${endpoint}`} className="font-normal">
                  {endpointLabels[endpoint]}
                  <span className="font-mono text-xs text-muted-foreground">{endpoint}</span>
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
          <FieldError>{fieldError('endpoints')}</FieldError>
        </FieldSet>
      </FieldGroup>
      {formLevelError && (
        <p role="alert" className="text-sm text-destructive">
          {formLevelError}
        </p>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? '正在添加…' : '添加'}
        </Button>
      </DialogFooter>
    </form>
  );
}
