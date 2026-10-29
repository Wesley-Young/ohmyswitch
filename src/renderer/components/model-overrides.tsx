import { Autocomplete } from '@base-ui/react/autocomplete';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ModelTitle } from '@/components/model-meta';
import { ModelOverrideFields } from '@/components/model-override-fields';
import { PageContent, PageHeader } from '@/components/page';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { refreshProviders } from '@/lib/cache';
import { formatTokens, modelFieldLabels, parseOverrideTokens } from '@/lib/models';
import { formError, trpc } from '@/lib/trpc';

export function ModelOverrides() {
  const [open, setOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string>();
  const [id, setId] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const overrides = useQuery(trpc.providers.modelOverrides.queryOptions());
  const baseModels = useQuery(trpc.providers.baseModels.queryOptions(undefined, { enabled: open }));
  const done = async (result: {
    affected: number;
    failures: { providerName: string; harnessId: string; message: string }[];
  }) => {
    await refreshProviders();
    if (result.failures.length)
      toast.warning(
        `已保存，但部分配置未更新：${result.failures.map((item) => `${item.providerName} / ${item.harnessId}：${item.message}`).join('；')}`,
      );
    else toast.success('已保存全局覆盖');
  };
  const set = useMutation(
    trpc.providers.setModelOverride.mutationOptions({
      onSuccess: async (result) => {
        setOpen(false);
        await done(result);
      },
      onError: (e) => toast.error(formError(e)?.message),
    }),
  );
  const remove = useMutation(
    trpc.providers.removeModelOverride.mutationOptions({
      onSuccess: async (result) => {
        await done(result);
      },
      onError: (e) => toast.error(formError(e)?.message),
    }),
  );
  const pick = (key: string) => {
    const value = overrides.data?.[key];
    setId(key);
    setEditingId(key || undefined);
    setName(value?.name ?? '');
    setContext(value?.contextWindow?.toString() ?? '');
    setOutput(value?.maxOutput?.toString() ?? '');
    setError('');
    setOpen(true);
  };
  const duplicateId = id.trim() !== editingId && Object.hasOwn(overrides.data ?? {}, id.trim());
  return (
    <>
      <PageHeader
        title="模型信息覆盖"
        actions={
          <Button disabled={overrides.isPending || overrides.isError} onClick={() => pick('')}>
            <Plus data-icon="inline-start" />
            添加覆盖
          </Button>
        }
      />
      <PageContent>
        {overrides.isPending ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : overrides.isError ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm">
            <span className="text-destructive">{formError(overrides.error)?.message}</span>
            <Button variant="outline" size="sm" onClick={() => void overrides.refetch()}>
              重试
            </Button>
          </div>
        ) : Object.keys(overrides.data).length ? (
          <div className="overflow-hidden rounded-lg border bg-card">
            {/* Every override has the same three fields, so they line up as columns. */}
            <table className="w-full table-fixed text-sm">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pl-4 text-left font-normal">模型 ID</th>
                  <th className="w-[26%] py-2 pl-4 text-left font-normal">{modelFieldLabels.name}</th>
                  <th className="w-[18%] py-2 pl-4 text-left font-normal">{modelFieldLabels.contextWindow}</th>
                  <th className="w-[18%] py-2 pl-4 text-left font-normal">{modelFieldLabels.maxOutput}</th>
                  <th className="w-12">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(overrides.data)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => (
                    <tr key={key}>
                      <td className="py-2.5 pl-4">
                        <ModelTitle model={{ id: key }} onOpen={() => pick(key)} />
                      </td>
                      <td className="py-2.5 pl-4">
                        {value.name ? (
                          <div className="truncate" title={value.name}>
                            {value.name}
                          </div>
                        ) : (
                          <Unset />
                        )}
                      </td>
                      <td className="py-2.5 pl-4">
                        {value.contextWindow ? <Tokens value={value.contextWindow} /> : <Unset />}
                      </td>
                      <td className="py-2.5 pl-4">
                        {value.maxOutput ? <Tokens value={value.maxOutput} /> : <Unset />}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                          aria-label={`删除 ${key} 的覆盖`}
                          disabled={remove.isPending || set.isPending}
                          onClick={() => setRemovingId(key)}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty className="border py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Settings2 />
              </EmptyMedia>
              <EmptyTitle>尚无模型信息覆盖</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </PageContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>全局模型信息覆盖</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const modelId = id.trim();
              if (duplicateId) return;
              const contextWindow = parseOverrideTokens(context);
              const maxOutput = parseOverrideTokens(output);
              if (!modelId || modelId.length > 256) {
                setError('请填写模型 ID，最多 256 个字符');
                return;
              }
              if (Number.isNaN(contextWindow) || Number.isNaN(maxOutput)) {
                setError('上下文和最大输出须为正整数');
                return;
              }
              if (!name.trim() && contextWindow === undefined && maxOutput === undefined) {
                setError('请至少填写一项覆盖信息');
                return;
              }
              setError('');
              set.mutate({
                modelId,
                override: {
                  ...(name.trim() ? { name: name.trim() } : {}),
                  ...(contextWindow === undefined ? {} : { contextWindow }),
                  ...(maxOutput === undefined ? {} : { maxOutput }),
                },
              });
            }}
          >
            <Field data-invalid={duplicateId}>
              <FieldLabel htmlFor="override-id">模型 ID</FieldLabel>
              <Autocomplete.Root
                items={(baseModels.data ?? [])
                  .map((model) => model.id)
                  .filter((modelId) => !Object.hasOwn(overrides.data ?? {}, modelId))}
                value={id}
                onValueChange={setId}
                openOnInputClick
              >
                <Autocomplete.InputGroup className="relative">
                  <Autocomplete.Input
                    render={<Input />}
                    id="override-id"
                    aria-invalid={duplicateId}
                    aria-describedby={duplicateId ? 'override-id-duplicate' : undefined}
                    maxLength={256}
                    autoFocus
                    className="pr-9 font-mono"
                  />
                  <Autocomplete.Trigger
                    render={<Button type="button" variant="ghost" size="icon-xs" />}
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    aria-label="显示模型列表"
                  >
                    <ChevronDown />
                  </Autocomplete.Trigger>
                </Autocomplete.InputGroup>
                <Autocomplete.Portal>
                  <Autocomplete.Positioner sideOffset={6} className="isolate z-50">
                    <Autocomplete.Popup className="relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
                      <Autocomplete.Empty>
                        <div className="p-2 text-sm text-muted-foreground">
                          {baseModels.isPending
                            ? '正在加载模型…'
                            : baseModels.isError
                              ? '无法加载模型，可以手动输入'
                              : '没有匹配的模型，可直接输入'}
                        </div>
                      </Autocomplete.Empty>
                      <Autocomplete.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto overscroll-contain p-1">
                        {(model: string) => (
                          <Autocomplete.Item
                            key={model}
                            value={model}
                            className="truncate rounded-md px-2 py-1.5 font-mono text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                          >
                            {model}
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.List>
                    </Autocomplete.Popup>
                  </Autocomplete.Positioner>
                </Autocomplete.Portal>
              </Autocomplete.Root>
              {duplicateId && (
                <p id="override-id-duplicate" role="alert" className="text-sm text-destructive">
                  该模型已有覆盖，请在列表中修改已有覆盖。
                </p>
              )}
            </Field>
            <ModelOverrideFields
              name={name}
              context={context}
              output={output}
              onNameChange={setName}
              onContextChange={setContext}
              onOutputChange={setOutput}
              inherited={baseModels.data?.find((model) => model.id === id.trim())}
            />
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={duplicateId || set.isPending || remove.isPending}>
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={removingId !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemovingId(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模型信息覆盖？</AlertDialogTitle>
            <AlertDialogDescription>删除后，{removingId} 将恢复使用各供应商保存的模型信息。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!removingId || remove.isPending}
              onClick={() => removingId && remove.mutate({ modelId: removingId })}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Tokens({ value }: { value: number }) {
  return <span className="font-mono tabular-nums">{formatTokens(value)}</span>;
}

/** A field the override leaves to each provider's own value. */
function Unset() {
  return <span className="text-muted-foreground">未覆盖</span>;
}
