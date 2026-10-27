import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  inputLabels,
  type Model,
  modelFieldLabels,
  modelOverrideFields,
  type ProviderModelOverride,
} from '@/lib/models';

type ModelField = Exclude<keyof Model, 'id'>;
const fields = Object.keys(modelFieldLabels) as ModelField[];

export function ModelDetailsDialog({
  model,
  effective,
  globalOverride,
  providerOverride,
  open,
  onOpenChange,
}: {
  model: Model | undefined;
  effective: Model | undefined;
  globalOverride: ProviderModelOverride;
  providerOverride: ProviderModelOverride;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>{model?.id} 详细信息</DialogTitle>
        </DialogHeader>
        {model && effective ? (
          <div className="min-h-0 overflow-y-auto">
            <dl className="divide-y rounded-lg border">
              {fields.map((field) => {
                const overrideField = modelOverrideFields.find((key) => key === field);
                const globalValue = overrideField ? globalOverride[overrideField] : undefined;
                const providerValue = overrideField ? providerOverride[overrideField] : undefined;
                // Source follows explicit presence, not equality with the lower layer.
                const source =
                  providerValue !== undefined ? '供应商覆盖' : globalValue !== undefined ? '全局覆盖' : undefined;
                return (
                  <div key={field} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 p-3">
                    <dt className="text-sm text-muted-foreground">{modelFieldLabels[field]}</dt>
                    <dd className="flex min-w-0 flex-wrap items-start justify-end gap-2 text-right text-sm">
                      <span
                        className={`min-w-0 whitespace-pre-wrap wrap-anywhere ${field === 'contextWindow' || field === 'maxOutput' ? 'font-mono' : ''}`}
                      >
                        {formatModelValue(effective, field)}
                      </span>
                      {source && overrideField && (
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
                              <TraceValue label="基础信息" value={model[overrideField]} />
                              <TraceValue label="全局覆盖" value={globalValue} />
                              <TraceValue label="供应商覆盖" value={providerValue} />
                            </dl>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">该模型已不在供应商列表中。</p>
        )}
        <DialogFooter className="shrink-0">
          <DialogClose render={<Button variant="outline" />}>关闭</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

/** Show unknown, false and empty metadata distinctly; do not infer capabilities. */
function formatModelValue(model: Model, field: ModelField): string {
  const value = model[field];
  if (value === undefined) return '/';
  switch (field) {
    case 'name':
      return model.name || '空字符串';
    case 'contextWindow':
    case 'maxOutput':
      return `${model[field]?.toLocaleString()} tokens`;
    case 'reasoning':
    case 'toolCall':
      return model[field] ? '支持' : '不支持';
    case 'input':
      return model.input?.map((input) => inputLabels[input]).join('、') || '无（空列表）';
    case 'interleaved':
      return model.interleaved === true ? '协议原生格式' : (model.interleaved?.field ?? '未知');
    case 'reasoningOptions':
      return (
        model.reasoningOptions
          ?.map((option) => {
            if (option.type === 'effort') return option.values.join(', ');
            if (option.type === 'toggle') return '可关闭推理';
            return `推理预算：${option.min?.toLocaleString() ?? '未指定下限'} – ${option.max?.toLocaleString() ?? '未指定上限'} tokens`;
          })
          .join('\n') || '不可调（空列表）'
      );
  }
}
