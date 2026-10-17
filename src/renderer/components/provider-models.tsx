import { Pencil, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ModelEditDialog } from '@/components/model-edit-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { formatTokens, inputLabels, type Model, optionalInputs, reasoningLabel } from '@/lib/models';

const byId = (a: Model, b: Model) => a.id.localeCompare(b.id);

/** The provider's model list. Models come from the provider; their metadata can be edited and they can be removed. */
export function ProviderModels({
  models,
  onChange,
  fetching,
  fetchError,
  onFetch,
  syncing,
  onSync,
}: {
  models: Model[];
  onChange: (models: Model[]) => void;
  fetching: boolean;
  fetchError: string | undefined;
  onFetch: () => void;
  syncing: boolean;
  onSync: () => void;
}) {
  const [editing, setEditing] = useState<Model>();
  const [editOpen, setEditOpen] = useState(false);
  const fetchButton = (
    <Button type="button" variant="outline" size="sm" disabled={fetching} onClick={onFetch}>
      {fetching ? '正在获取…' : '从供应商获取'}
    </Button>
  );

  return (
    <section className="grid gap-3" aria-labelledby="provider-models-title">
      <div className="flex h-7 items-center justify-between gap-2">
        <h2 id="provider-models-title" className="flex items-center gap-2 text-sm font-medium">
          模型
          {models.length > 0 && (
            <Badge variant="secondary" className="font-normal">
              {models.length}
            </Badge>
          )}
        </h2>
        {models.length > 0 && (
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" disabled={syncing} onClick={onSync}>
              {syncing ? '正在同步…' : '从 models.dev 同步元信息'}
            </Button>
            {fetchButton}
          </div>
        )}
      </div>
      {models.length ? (
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border bg-card">
          {models.map((model) => (
            <li key={model.id} className="flex items-center gap-1 py-2 pr-2 pl-3">
              <ModelSummary model={model} />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`编辑 ${model.id}`}
                onClick={() => {
                  setEditing(model);
                  setEditOpen(true);
                }}
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`移除 ${model.id}`}
                onClick={() => onChange(models.filter((item) => item.id !== model.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyTitle className="text-sm">还没有模型</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>{fetchButton}</EmptyContent>
        </Empty>
      )}
      {fetchError && (
        <p role="alert" className="text-sm text-destructive">
          {fetchError}
        </p>
      )}
      <ModelEditDialog
        model={editing}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={(saved) => onChange(models.map((item) => (item.id === saved.id ? saved : item)))}
      />
    </section>
  );
}

function ModelSummary({ model }: { model: Model }) {
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
  open,
  onOpenChange,
  remote,
  current,
  onConfirm,
}: {
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
  remote,
  current,
  onConfirm,
}: {
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
        // The dialog is portaled, but React still bubbles submit to the page form.
        event.preventDefault();
        event.stopPropagation();
        confirm();
      }}
    >
      <DialogHeader>
        <DialogTitle>选择模型</DialogTitle>
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
