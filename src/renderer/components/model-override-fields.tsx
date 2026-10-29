import { useId } from 'react';

import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ProviderModelOverride } from '@/lib/models';

/** Shared inputs for global and provider overrides; empty values mean no override and show what applies instead. */
export function ModelOverrideFields({
  name,
  context,
  output,
  onNameChange,
  onContextChange,
  onOutputChange,
  inherited = {},
  autoFocus = false,
}: {
  name: string;
  context: string;
  output: string;
  onNameChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onOutputChange: (value: string) => void;
  inherited?: ProviderModelOverride;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>名称</FieldLabel>
        <Input
          id={`${id}-name`}
          value={name}
          placeholder={inherited.name}
          maxLength={256}
          autoFocus={autoFocus}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`${id}-context`}>上下文</FieldLabel>
          <Input
            id={`${id}-context`}
            inputMode="numeric"
            value={context}
            placeholder={inherited.contextWindow?.toString()}
            onChange={(event) => onContextChange(event.target.value)}
            className="font-mono"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-output`}>最大输出</FieldLabel>
          <Input
            id={`${id}-output`}
            inputMode="numeric"
            value={output}
            placeholder={inherited.maxOutput?.toString()}
            onChange={(event) => onOutputChange(event.target.value)}
            className="font-mono"
          />
        </Field>
      </div>
    </>
  );
}
