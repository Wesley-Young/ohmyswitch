import { useId } from 'react';

import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/** Shared inputs for global and provider overrides; empty values mean no override. */
export function ModelOverrideFields({
  name,
  context,
  output,
  onNameChange,
  onContextChange,
  onOutputChange,
  autoFocus = false,
}: {
  name: string;
  context: string;
  output: string;
  onNameChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onOutputChange: (value: string) => void;
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
            onChange={(event) => onOutputChange(event.target.value)}
            className="font-mono"
          />
        </Field>
      </div>
    </>
  );
}
