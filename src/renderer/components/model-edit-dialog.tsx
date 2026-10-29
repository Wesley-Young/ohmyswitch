import { useState } from 'react';

import { ModelOverrideFields } from '@/components/model-override-fields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type Model, type ProviderModelOverride, parseOverrideTokens } from '@/lib/models';

export function ModelEditDialog({
  model,
  override,
  open,
  pending,
  error,
  onOpenChange,
  onSave,
}: {
  model: Model | undefined;
  override: ProviderModelOverride;
  open: boolean;
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (override: ProviderModelOverride) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" showCloseButton={!pending}>
        {open && !model && (
          <DialogHeader>
            <DialogTitle>模型已移除</DialogTitle>
            <DialogDescription>该模型已不在供应商列表中，请关闭后重新选择。</DialogDescription>
          </DialogHeader>
        )}
        {open && model && (
          <ModelOverrideForm
            key={model.id}
            model={model}
            override={override}
            pending={pending}
            error={error}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModelOverrideForm({
  model,
  override,
  pending,
  error,
  onSave,
}: {
  model: Model;
  override: ProviderModelOverride;
  pending: boolean;
  error?: string;
  onSave: (override: ProviderModelOverride) => void;
}) {
  const [name, setName] = useState(override.name ?? '');
  const [context, setContext] = useState(override.contextWindow?.toString() ?? '');
  const [output, setOutput] = useState(override.maxOutput?.toString() ?? '');
  const [validationError, setValidationError] = useState('');

  return (
    <>
      <DialogHeader className="pr-6">
        <DialogTitle>覆盖 {model.id} 模型信息</DialogTitle>
      </DialogHeader>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (pending) return;
          const contextWindow = parseOverrideTokens(context);
          const maxOutput = parseOverrideTokens(output);
          if (Number.isNaN(contextWindow) || Number.isNaN(maxOutput)) {
            setValidationError('上下文和最大输出须为正整数');
            return;
          }
          setValidationError('');
          // Saving an empty object removes all provider overrides for this model.
          onSave({
            ...(name.trim() ? { name: name.trim() } : {}),
            ...(contextWindow === undefined ? {} : { contextWindow }),
            ...(maxOutput === undefined ? {} : { maxOutput }),
          });
        }}
      >
        <fieldset disabled={pending} className="grid min-w-0 gap-3">
          <ModelOverrideFields
            name={name}
            context={context}
            output={output}
            onNameChange={setName}
            onContextChange={setContext}
            onOutputChange={setOutput}
            inherited={model}
            autoFocus
          />
        </fieldset>
        {(validationError || error) && (
          <p role="alert" className="text-sm text-destructive">
            {validationError || error}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>取消</DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
