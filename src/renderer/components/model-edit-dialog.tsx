import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  effortValues,
  inputLabels,
  type Model,
  type ModelInput,
  optionalInputs,
  type ReasoningOption,
} from '@/lib/models';

export function ModelEditDialog({
  model,
  open,
  onOpenChange,
  onSave,
  overriddenFields = [],
}: {
  model: Model | undefined;
  overriddenFields?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (model: Model) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {model && (
          <ModelEditForm
            model={model}
            overriddenFields={overriddenFields}
            onSave={(saved) => {
              onSave(saved);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Empty means unknown. Digits may be grouped with spaces, commas or underscores. */
function parseTokens(value: string): number | undefined | 'invalid' {
  const digits = value.replace(/[\s,_]/g, '');
  if (!digits) return undefined;
  if (!/^\d+$/.test(digits)) return 'invalid';
  const tokens = Number(digits);
  return Number.isSafeInteger(tokens) && tokens > 0 ? tokens : 'invalid';
}

/**
 * Unknown values stay unknown: an unset flag that is left unchecked is saved as unset, not as `false`,
 * so harnesses keep using their own defaults for it.
 */
function keepUnknown(initial: boolean | undefined, current: boolean) {
  return initial === undefined && !current ? undefined : current;
}

/** Same rule as the server: letters, digits, `-` and `_`. */
const effortPattern = /^[A-Za-z0-9_-]{1,32}$/;

/** Effort levels typed as a list separated by commas or spaces, deduplicated in order. */
function parseEfforts(value: string): string[] | 'invalid' {
  const efforts = [...new Set(value.split(/[\s,，]+/).filter(Boolean))];
  if (efforts.length > 16 || efforts.some((effort) => !effortPattern.test(effort))) return 'invalid';
  return efforts;
}

/**
 * Rebuild the reasoning options from the edited effort levels and off switch. Budget options are not editable
 * here and are kept. Unknown stays unknown when nothing was set.
 */
function buildReasoningOptions(initial: Model['reasoningOptions'], efforts: string[], canTurnOff: boolean) {
  const options: ReasoningOption[] = [
    ...(canTurnOff ? [{ type: 'toggle' as const }] : []),
    ...(efforts.length ? [{ type: 'effort' as const, values: efforts }] : []),
    ...(initial ?? []).filter((option) => option.type === 'budget_tokens'),
  ];
  return initial === undefined && !options.length ? undefined : options;
}

/** Mounted only while the dialog is open, so the fields start from the model every time. */
function ModelEditForm({
  model,
  onSave,
  overriddenFields,
}: {
  model: Model;
  onSave: (model: Model) => void;
  overriddenFields: string[];
}) {
  const [name, setName] = useState(model.name ?? '');
  const [contextWindow, setContextWindow] = useState(model.contextWindow?.toString() ?? '');
  const [maxOutput, setMaxOutput] = useState(model.maxOutput?.toString() ?? '');
  const [reasoning, setReasoning] = useState(model.reasoning ?? false);
  const [toolCall, setToolCall] = useState(model.toolCall ?? false);
  const [inputs, setInputs] = useState<ModelInput[]>(model.input ?? []);
  const [efforts, setEfforts] = useState(effortValues(model.reasoningOptions).join(', '));
  const [canTurnOff, setCanTurnOff] = useState(
    model.reasoningOptions?.some((option) => option.type === 'toggle') ?? false,
  );
  const [submitted, setSubmitted] = useState(false);

  const parsedContext = parseTokens(contextWindow);
  const parsedOutput = parseTokens(maxOutput);
  const tokenError = (parsed: ReturnType<typeof parseTokens>) =>
    submitted && parsed === 'invalid' ? '请填写正整数' : undefined;
  const parsedEfforts = parseEfforts(efforts);
  const effortError =
    submitted && reasoning && parsedEfforts === 'invalid' ? '推理等级只能包含字母、数字、- 和 _' : undefined;
  const extraInputs = optionalInputs.filter((input) => inputs.includes(input));

  return (
    <form
      noValidate
      className="grid min-w-0 gap-5"
      onSubmit={(event) => {
        // The dialog is portaled, but React still bubbles submit through the component tree; keep it here.
        event.preventDefault();
        event.stopPropagation();
        setSubmitted(true);
        if (parsedContext === 'invalid' || parsedOutput === 'invalid') return;
        if (reasoning && parsedEfforts === 'invalid') return;
        const trimmedName = name.trim();
        // Start from the full model so fields this dialog does not show (such as `interleaved`) are kept.
        const next: Model = {
          ...model,
          name: trimmedName && trimmedName !== model.id ? trimmedName : undefined,
          contextWindow: parsedContext,
          maxOutput: parsedOutput,
          reasoning: keepUnknown(model.reasoning, reasoning),
          // Reasoning settings are hidden while reasoning is off; they are kept as they were.
          reasoningOptions:
            reasoning && parsedEfforts !== 'invalid'
              ? buildReasoningOptions(model.reasoningOptions, parsedEfforts, canTurnOff)
              : model.reasoningOptions,
          toolCall: keepUnknown(model.toolCall, toolCall),
          input: model.input === undefined && !extraInputs.length ? undefined : ['text', ...extraInputs],
        };
        onSave(Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)) as Model);
      }}
    >
      <DialogHeader>
        <DialogTitle className="truncate font-mono" title={model.id}>
          {model.id}
        </DialogTitle>
      </DialogHeader>
      {overriddenFields.length > 0 && (
        <p className="text-xs text-muted-foreground">{overriddenFields.join('、')}受全局覆盖，修改供应商值暂不生效。</p>
      )}
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="model-name">名称</FieldLabel>
          <Input
            id="model-name"
            value={name}
            maxLength={256}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field data-invalid={Boolean(tokenError(parsedContext))}>
            <FieldLabel htmlFor="model-context">上下文</FieldLabel>
            <Input
              id="model-context"
              inputMode="numeric"
              className="font-mono"
              value={contextWindow}
              aria-invalid={Boolean(tokenError(parsedContext))}
              onChange={(event) => setContextWindow(event.target.value)}
            />
            <FieldError>{tokenError(parsedContext)}</FieldError>
          </Field>
          <Field data-invalid={Boolean(tokenError(parsedOutput))}>
            <FieldLabel htmlFor="model-output">最大输出</FieldLabel>
            <Input
              id="model-output"
              inputMode="numeric"
              className="font-mono"
              value={maxOutput}
              aria-invalid={Boolean(tokenError(parsedOutput))}
              onChange={(event) => setMaxOutput(event.target.value)}
            />
            <FieldError>{tokenError(parsedOutput)}</FieldError>
          </Field>
        </div>
        <FieldSet>
          <FieldLegend variant="label">能力</FieldLegend>
          <FieldGroup className="gap-2.5">
            <Field orientation="horizontal">
              <Checkbox id="model-reasoning" checked={reasoning} onCheckedChange={setReasoning} />
              <FieldLabel htmlFor="model-reasoning" className="font-normal">
                推理
              </FieldLabel>
            </Field>
            {reasoning && (
              <FieldGroup className="gap-2.5 pl-6">
                <Field data-invalid={Boolean(effortError)}>
                  <FieldLabel htmlFor="model-efforts" className="font-normal">
                    推理等级
                  </FieldLabel>
                  <Input
                    id="model-efforts"
                    className="font-mono"
                    placeholder="low, medium, high"
                    value={efforts}
                    aria-invalid={Boolean(effortError)}
                    onChange={(event) => setEfforts(event.target.value)}
                  />
                  <FieldError>{effortError}</FieldError>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox id="model-can-turn-off" checked={canTurnOff} onCheckedChange={setCanTurnOff} />
                  <FieldLabel htmlFor="model-can-turn-off" className="font-normal">
                    可关闭推理
                  </FieldLabel>
                </Field>
              </FieldGroup>
            )}
            <Field orientation="horizontal">
              <Checkbox id="model-tool-call" checked={toolCall} onCheckedChange={setToolCall} />
              <FieldLabel htmlFor="model-tool-call" className="font-normal">
                工具调用
              </FieldLabel>
            </Field>
            {optionalInputs.map((input) => (
              <Field key={input} orientation="horizontal">
                <Checkbox
                  id={`model-input-${input}`}
                  checked={inputs.includes(input)}
                  onCheckedChange={(checked) =>
                    setInputs((current) => (checked ? [...current, input] : current.filter((item) => item !== input)))
                  }
                />
                <FieldLabel htmlFor={`model-input-${input}`} className="font-normal">
                  {inputLabels[input]}输入
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>取消</DialogClose>
        <Button type="submit">确定</Button>
      </DialogFooter>
    </form>
  );
}
