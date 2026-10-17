import { useMutation, useQuery } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { HarnessIcon, type HarnessId } from '@/components/harness-icon';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { refreshProviders } from '@/lib/cache';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type Harness = RouterOutputs['harnesses']['list'][number];
type Application = RouterOutputs['harnesses']['applications'][string][number];

const stateLabels = {
  applied: '',
  modified: '配置已在外部被修改',
  missing: '配置已在外部被移除',
  unreadable: '配置文件无法读取',
} satisfies Record<Application['state'], string>;

const isConflict = (error: unknown) => error instanceof TRPCClientError && error.data?.code === 'CONFLICT';

/** Where a provider is applied: one row per harness with a switch. Harnesses not installed are folded away. */
export function HarnessApplications({ providerId }: { providerId: string }) {
  // Harness configs can change outside ohmyswitch, so their state is always read fresh.
  const harnesses = useQuery(trpc.harnesses.list.queryOptions(undefined, { staleTime: 0 }));
  const applications = useQuery(trpc.harnesses.applications.queryOptions(undefined, { staleTime: 0 }));
  const [conflict, setConflict] = useState<{ harness: Harness; message: string }>();
  const [conflictOpen, setConflictOpen] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  const applied = applications.data?.[providerId] ?? [];
  const nameOf = (harnessId: HarnessId) =>
    harnesses.data?.find((harness) => harness.id === harnessId)?.name ?? harnessId;

  const apply = useMutation(
    trpc.harnesses.apply.mutationOptions({
      onSuccess: async (_, { harnessId, replace }) => {
        await refreshProviders();
        setConflictOpen(false);
        const rewrite = applied.some((item) => item.harnessId === harnessId);
        toast.success(rewrite && !replace ? `已重新写入 ${nameOf(harnessId)}` : `已应用到 ${nameOf(harnessId)}`);
      },
      onError: (error, { harnessId }) => {
        const harness = harnesses.data?.find((item) => item.id === harnessId);
        if (harness && isConflict(error)) {
          setConflict({ harness, message: formError(error)?.message ?? '' });
          setConflictOpen(true);
          return;
        }
        toast.error(formError(error)?.message);
      },
    }),
  );
  const unapply = useMutation(
    trpc.harnesses.unapply.mutationOptions({
      onSuccess: async (_, { harnessId }) => {
        await refreshProviders();
        toast.success(`已从 ${nameOf(harnessId)} 移除`);
      },
      onError: (error) => toast.error(formError(error)?.message),
    }),
  );
  const pending = apply.isPending || unapply.isPending;

  if (harnesses.isPending || applications.isPending) return <Skeleton className="h-28 w-full rounded-lg" />;
  if (harnesses.isError || applications.isError) {
    return (
      <div className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
        <span className="text-destructive">{formError(harnesses.error ?? applications.error)?.message}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void harnesses.refetch();
            void applications.refetch();
          }}
        >
          重试
        </Button>
      </div>
    );
  }

  const row = (harness: Harness) => {
    const application = applied.find((item) => item.harnessId === harness.id);
    const problem = application ? stateLabels[application.state] : '';
    const canRewrite = application?.state === 'modified' || application?.state === 'missing';
    return (
      <li key={harness.id} className="flex items-center gap-3 px-4 py-3">
        <HarnessIcon id={harness.id} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{harness.name}</div>
          <div className="truncate font-mono text-xs text-muted-foreground" title={harness.configPath}>
            {harness.configPath}
          </div>
          {problem && <div className="text-xs text-destructive">{problem}</div>}
        </div>
        {canRewrite && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => apply.mutate({ providerId, harnessId: harness.id, replace: false })}
          >
            重新写入
          </Button>
        )}
        <Switch
          aria-label={`应用到 ${harness.name}`}
          checked={Boolean(application)}
          disabled={pending || (!harness.detected && !application)}
          onCheckedChange={(checked) =>
            checked
              ? apply.mutate({ providerId, harnessId: harness.id, replace: false })
              : unapply.mutate({ providerId, harnessId: harness.id })
          }
        />
      </li>
    );
  };

  // A harness the provider is applied to stays in the main list even if it has since been uninstalled.
  const visible = harnesses.data.filter(
    (harness) => harness.detected || applied.some((a) => a.harnessId === harness.id),
  );
  const missing = harnesses.data.filter((harness) => !visible.includes(harness));

  return (
    <>
      <div className="grid gap-2">
        {visible.length > 0 && <ul className="divide-y rounded-lg border bg-card">{visible.map(row)}</ul>}
        {missing.length > 0 && (
          <div className="grid gap-2">
            <button
              type="button"
              aria-expanded={showMissing}
              className="flex items-center gap-1 justify-self-start rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowMissing((value) => !value)}
            >
              <ChevronRight
                className={showMissing ? 'size-4 rotate-90 transition-transform' : 'size-4 transition-transform'}
              />
              未安装（{missing.length}）
            </button>
            {showMissing && <ul className="divide-y rounded-lg border bg-card">{missing.map(row)}</ul>}
          </div>
        )}
      </div>
      <AlertDialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{conflict?.message}，替换它？</AlertDialogTitle>
            <AlertDialogDescription>
              替换后这个条目由 ohmyswitch 管理，其中的名称、地址、API Key 和模型会被覆盖。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={!conflict || apply.isPending}
              onClick={() => conflict && apply.mutate({ providerId, harnessId: conflict.harness.id, replace: true })}
            >
              替换
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
