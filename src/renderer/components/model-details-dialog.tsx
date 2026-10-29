import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  formatTokens,
  inputLabels,
  type Model,
  type ModelInput,
  modelFieldLabels,
  type ProviderModelOverride,
} from '@/lib/models';

type OverrideField = keyof ProviderModelOverride;
type Overrides = { model: Model; globalOverride: ProviderModelOverride; providerOverride: ProviderModelOverride };

const inputs = Object.keys(inputLabels) as ModelInput[];

export function ModelDetailsDialog({
  model,
  effective,
  globalOverride,
  providerOverride,
  open,
  onOpenChange,
  editDisabled,
  onEdit,
}: {
  model: Model | undefined;
  effective: Model | undefined;
  globalOverride: ProviderModelOverride;
  providerOverride: ProviderModelOverride;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editDisabled?: boolean;
  /** Edits the provider's override of the model, which this dialog shows. */
  onEdit: (model: Model) => void;
}) {
  const overrides = model && { model, globalOverride, providerOverride };
  const title = effective?.name || model?.id || '模型';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0 pr-6">
          <div className="flex min-w-0 items-center gap-2">
            <DialogTitle className="truncate text-lg leading-tight" title={title}>
              {title}
            </DialogTitle>
            {overrides && <OverrideBadge field="name" {...overrides} />}
          </div>
          {model && title !== model.id && (
            <DialogDescription className="font-mono text-xs wrap-anywhere">{model.id}</DialogDescription>
          )}
        </DialogHeader>
        {overrides && effective ? (
          <div className="min-h-0 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-2 divide-x rounded-lg border">
              <TokenStat field="contextWindow" value={effective.contextWindow} overrides={overrides} />
              <TokenStat field="maxOutput" value={effective.maxOutput} overrides={overrides} />
            </div>
            <dl className="divide-y rounded-lg border">
              <Row label={modelFieldLabels.input}>
                {effective.input === undefined ? (
                  <Unknown />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {inputs.map((input) =>
                      effective.input?.includes(input) ? (
                        <Badge key={input} variant="secondary">
                          {inputLabels[input]}
                        </Badge>
                      ) : (
                        <Badge
                          key={input}
                          variant="outline"
                          className="border-dashed font-normal text-muted-foreground line-through"
                        >
                          {inputLabels[input]}
                        </Badge>
                      ),
                    )}
                  </div>
                )}
              </Row>
              <Row label={modelFieldLabels.toolCall}>
                <Support value={effective.toolCall} />
              </Row>
              <Row label={modelFieldLabels.reasoning}>
                <Support value={effective.reasoning} />
              </Row>
              {/* Unset options mean unknown, which matters only when the model reasons. */}
              {(effective.reasoningOptions !== undefined || effective.reasoning === true) && (
                <Row label={modelFieldLabels.reasoningOptions}>
                  <ReasoningOptions options={effective.reasoningOptions} />
                </Row>
              )}
              {/* Unset means reasoning is not sent back: the format has no `false`, and harnesses write nothing. */}
              {effective.interleaved !== undefined && (
                <Row label={modelFieldLabels.interleaved}>
                  {effective.interleaved === true ? (
                    '协议原生格式'
                  ) : (
                    <code className="font-mono text-xs">{effective.interleaved.field}</code>
                  )}
                </Row>
              )}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">该模型已不在供应商列表中。</p>
        )}
        <DialogFooter className="shrink-0">
          {model && (
            <Button disabled={editDisabled} onClick={() => onEdit(model)}>
              编辑
            </Button>
          )}
          <DialogClose render={<Button variant="outline" />}>关闭</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenStat({
  field,
  value,
  overrides,
}: {
  field: 'contextWindow' | 'maxOutput';
  value: number | undefined;
  overrides: Overrides;
}) {
  return (
    <div className="min-w-0 space-y-1 p-4">
      <div className="flex h-5 items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{modelFieldLabels[field]}</span>
        <OverrideBadge field={field} {...overrides} />
      </div>
      {value === undefined ? (
        <>
          <p className="text-2xl font-semibold tracking-tight text-muted-foreground">未知</p>
          <p className="text-xs">&nbsp;</p>
        </>
      ) : (
        <>
          <p className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{formatTokens(value)}</p>
          <p className="truncate font-mono text-xs text-muted-foreground tabular-nums">
            {value.toLocaleString()} tokens
          </p>
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** Unknown, false and empty metadata read differently; capabilities are never inferred. */
function Unknown() {
  return <span className="text-muted-foreground">未知</span>;
}

function Support({ value }: { value: boolean | undefined }) {
  if (value === undefined) return <Unknown />;
  return value ? (
    <span className="inline-flex items-center gap-1.5">
      <Check className="size-4 text-success" aria-hidden />
      支持
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <X className="size-4" aria-hidden />
      不支持
    </span>
  );
}

function ReasoningOptions({ options }: { options: Model['reasoningOptions'] }) {
  if (options === undefined) return <Unknown />;
  if (options.length === 0) return <span className="text-muted-foreground">不可调</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        if (option.type === 'effort')
          return option.values.map((value) => (
            <Badge key={`effort-${value}`} variant="outline" className="font-mono font-normal">
              {value}
            </Badge>
          ));
        if (option.type === 'toggle')
          return (
            <Badge key="toggle" variant="outline" className="font-mono font-normal">
              off
            </Badge>
          );
        return (
          <Badge key="budget" variant="outline" className="font-normal">
            预算
            <span className="font-mono">
              {option.min?.toLocaleString() ?? '?'} – {option.max?.toLocaleString() ?? '?'}
            </span>
          </Badge>
        );
      })}
    </div>
  );
}

/** Marks a field whose value comes from an override, with a tooltip tracing each layer. */
function OverrideBadge({ field, model, globalOverride, providerOverride }: { field: OverrideField } & Overrides) {
  const globalValue = globalOverride[field];
  const providerValue = providerOverride[field];
  // Source follows explicit presence, not equality with the lower layer.
  const source = providerValue !== undefined ? '供应商覆盖' : globalValue !== undefined ? '全局覆盖' : undefined;
  if (!source) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            render={<button type="button" />}
            variant={providerValue !== undefined ? 'secondary' : 'outline'}
            className="cursor-help"
          />
        }
        aria-label={`${modelFieldLabels[field]}：${source}，查看溯源`}
      >
        {source}
      </TooltipTrigger>
      <TooltipContent className="block max-w-[min(24rem,calc(100vw-2rem))] text-left" align="end">
        <dl className="space-y-2">
          <TraceValue label="基础信息" value={model[field]} />
          <TraceValue label="全局覆盖" value={globalValue} />
          <TraceValue label="供应商覆盖" value={providerValue} />
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

function TraceValue({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
      <dt className="opacity-80">{label}</dt>
      <dd
        className={`min-w-0 whitespace-pre-wrap wrap-anywhere text-right ${typeof value === 'number' ? 'font-mono' : ''}`}
      >
        {value === undefined ? '/' : value === '' ? '空字符串' : value.toLocaleString()}
      </dd>
    </div>
  );
}
