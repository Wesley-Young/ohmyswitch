import { useMutation } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, RefreshCw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useHarnessFeedback } from '@/components/harness-feedback';
import { ModelEditDialog } from '@/components/model-edit-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { refreshProviders } from '@/lib/cache';
import { formatTokens, inputLabels, type Model, optionalInputs, reasoningLabel } from '@/lib/models';
import { formError, trpc } from '@/lib/trpc';

const byId = (a: Model, b: Model) => a.id.localeCompare(b.id);

/**
 * The provider's models on its page. Each change is saved right away and rewrites the harnesses the provider is
 * applied to, like the switches in 应用到.
 */
export function ProviderModels({
  providerId,
  providerName,
  models,
}: {
  providerId: string;
  providerName: string;
  models: Model[];
}) {
  const report = useHarnessFeedback();
  const [editing, setEditing] = useState<Model>();
  const [editOpen, setEditOpen] = useState(false);
  const [picking, setPicking] = useState(false);

  const fetchModels = useMutation(
    trpc.providers.fetchModels.mutationOptions({
      onSuccess: ({ metadataError }) => {
        if (metadataError) toast.warning(`未能补全模型信息：${metadataError}`);
        setPicking(true);
      },
    }),
  );
  const setModels = useMutation(
    trpc.providers.setModels.mutationOptions({
      onSuccess: () => refreshProviders(),
      onError: (error) => toast.error(formError(error)?.message),
    }),
  );
  const syncModels = useMutation(
    trpc.providers.syncModels.mutationOptions({
      onSuccess: async (saved) => {
        await refreshProviders();
        const synced = saved.modelCount - saved.unmatched;
        if (!synced) toast.warning('models.dev 中没有这些模型的信息');
        else
          report(
            saved.unmatched
              ? `已从 models.dev 更新 ${synced} 个模型，${saved.unmatched} 个未找到`
              : `已从 models.dev 更新 ${synced} 个模型`,
            saved,
          );
      },
      onError: (error) => toast.error(formError(error)?.message),
    }),
  );
  const pending = fetchModels.isPending || setModels.isPending || syncModels.isPending;

  const save = (next: Model[], message: string, undo?: Model[]) =>
    setModels.mutate(
      { providerId, models: next },
      {
        onSuccess: (saved) =>
          report(
            message,
            saved,
            undo && {
              action: {
                label: '撤销',
                onClick: () =>
                  setModels.mutate(
                    { providerId, models: undo },
                    { onSuccess: (restored) => report('已撤销', restored) },
                  ),
              },
            },
          ),
      },
    );

  const pickButton = (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => fetchModels.mutate({ providerId })}>
      {fetchModels.isPending ? '正在获取…' : '选择模型…'}
    </Button>
  );

  return (
    <section className="grid gap-3" aria-labelledby="provider-models-title">
      <div className="flex h-7 items-center justify-between gap-2">
        <h2 id="provider-models-title" className="text-sm font-medium">
          模型{models.length > 0 && <span className="ml-1.5 text-muted-foreground">{models.length}</span>}
        </h2>
        {models.length > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            {pickButton}
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={pending}
                render={<Button variant="ghost" size="icon-sm" aria-label="更多模型操作" />}
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => syncModels.mutate({ providerId })}>
                  <RefreshCw />
                  更新模型信息
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {fetchModels.error && (
        <p role="alert" className="text-sm text-destructive">
          {formError(fetchModels.error)?.message}
        </p>
      )}
      {models.length ? (
        <ul className="divide-y rounded-lg border bg-card">
          {models.map((model) => (
            <li key={model.id} className="flex items-center gap-1 py-2.5 pr-2 pl-4">
              <ModelSummary model={model} />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`编辑 ${model.id}`}
                disabled={pending}
                onClick={() => {
                  setEditing(model);
                  setEditOpen(true);
                }}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`移除 ${model.id}`}
                disabled={pending}
                onClick={() =>
                  save(
                    models.filter((item) => item.id !== model.id),
                    `已移除 ${model.id}`,
                    models,
                  )
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyTitle className="text-sm">尚未配置模型</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>{pickButton}</EmptyContent>
        </Empty>
      )}
      <ModelEditDialog
        model={editing}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={(saved) =>
          save(
            models.map((item) => (item.id === saved.id ? saved : item)),
            `已保存 ${saved.id}`,
          )
        }
      />
      <ModelPickerDialog
        title={`从 ${providerName} 选择模型`}
        open={picking}
        onOpenChange={setPicking}
        remote={fetchModels.data?.models ?? []}
        current={models}
        onConfirm={(next) => save(next, `已保存 ${next.length} 个模型`)}
      />
    </section>
  );
}

/** A model's id, name and known metadata, for lists. */
export function ModelSummary({ model }: { model: Model }) {
  const facts = [
    model.contextWindow && `上下文 ${formatTokens(model.contextWindow)}`,
    model.maxOutput && `输出 ${formatTokens(model.maxOutput)}`,
    reasoningLabel(model),
    ...optionalInputs.filter((input) => model.input?.includes(input)).map((input) => inputLabels[input]),
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-mono text-sm" title={model.id}>
          {model.id}
        </span>
        {model.name && <span className="truncate text-xs text-muted-foreground">{model.name}</span>}
      </div>
      {(facts.length > 0 || model.toolCall === false) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {facts.map((fact) => (
            <Badge key={fact} variant="outline" className="font-normal text-muted-foreground">
              {fact}
            </Badge>
          ))}
          {model.toolCall === false && (
            <Badge variant="outline" className="font-normal text-destructive">
              不支持工具调用
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

/** Choose which of the provider's models to keep. Models the provider no longer lists are left untouched. */
export function ModelPickerDialog({
  title,
  open,
  onOpenChange,
  remote,
  current,
  onConfirm,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  remote: Model[];
  current: Model[];
  onConfirm: (models: Model[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ModelPicker
          title={title}
          remote={remote}
          current={current}
          onConfirm={(models) => {
            onConfirm(models);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so the selection starts from the current list every time. */
function ModelPicker({
  title,
  remote,
  current,
  onConfirm,
}: {
  title: string;
  remote: Model[];
  current: Model[];
  onConfirm: (models: Model[]) => void;
}) {
  const [query, setQuery] = useState('');
  // With no models yet, start from everything the provider offers; otherwise from what is already kept.
  const [selected, setSelected] = useState(
    () => new Set(current.length ? current.map((model) => model.id) : remote.map((model) => model.id)),
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return remote;
    return remote.filter((model) => `${model.id} ${model.name ?? ''}`.toLowerCase().includes(needle));
  }, [remote, query]);
  const selectedCount = remote.filter((model) => selected.has(model.id)).length;
  const visibleSelected = visible.filter((model) => selected.has(model.id)).length;

  const toggle = (ids: string[], checked: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const confirm = () => {
    const remoteIds = new Set(remote.map((model) => model.id));
    const existing = new Map(current.map((model) => [model.id, model]));
    onConfirm(
      [
        ...current.filter((model) => !remoteIds.has(model.id)),
        // Values already on a kept model (possibly edited by hand) win; fetched metadata only fills the gaps.
        ...remote.filter((model) => selected.has(model.id)).map((model) => ({ ...model, ...existing.get(model.id) })),
      ].sort(byId),
    );
  };

  return (
    <form
      noValidate
      className="grid min-w-0 gap-4"
      onSubmit={(event) => {
        // The dialog is portaled, but React still bubbles submit through the component tree; keep it here.
        event.preventDefault();
        event.stopPropagation();
        confirm();
      }}
    >
      <DialogHeader>
        <DialogTitle className="truncate">{title}</DialogTitle>
      </DialogHeader>
      <Input
        type="search"
        placeholder="搜索模型"
        aria-label="搜索模型"
        className="font-mono"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2 px-3 text-sm">
          <div className="flex items-center gap-3">
            <Checkbox
              id="model-picker-all"
              checked={visible.length > 0 && visibleSelected === visible.length}
              indeterminate={visibleSelected > 0 && visibleSelected < visible.length}
              disabled={!visible.length}
              onCheckedChange={(checked) =>
                toggle(
                  visible.map((model) => model.id),
                  checked,
                )
              }
            />
            <label htmlFor="model-picker-all">全选</label>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            已选 {selectedCount} / {remote.length}
          </span>
        </div>
        <ul className="h-80 divide-y overflow-y-auto rounded-lg border">
          {visible.map((model, index) => (
            <li key={model.id} className="flex items-center gap-3 pl-3 hover:bg-muted/50">
              <Checkbox
                id={`model-picker-${index}`}
                checked={selected.has(model.id)}
                onCheckedChange={(checked) => toggle([model.id], checked)}
              />
              <label
                htmlFor={`model-picker-${index}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 pr-3"
              >
                <ModelSummary model={model} />
              </label>
            </li>
          ))}
          {!visible.length && <li className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配的模型</li>}
        </ul>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>取消</DialogClose>
        <Button type="submit">确定</Button>
      </DialogFooter>
    </form>
  );
}
