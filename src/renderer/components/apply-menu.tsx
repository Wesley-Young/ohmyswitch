import { useMutation } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { cn } from 'cn';
import { Boxes, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { HarnessGlyph, type HarnessId } from '@/components/harness-icon';
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { refreshProviders } from '@/lib/cache';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type Harness = RouterOutputs['harnesses']['list'][number];
export type Application = RouterOutputs['harnesses']['applications'][string][number];

const stateLabels = {
  applied: '',
  modified: '已被修改',
  missing: '已被移除',
  unreadable: '无法读取',
} satisfies Record<Application['state'], string>;

const isConflict = (error: unknown) => error instanceof TRPCClientError && error.data?.code === 'CONFLICT';

/** Apply a provider to harnesses, remove it, or write it again after the config was changed elsewhere. */
export function ApplyMenu({
  providerId,
  harnesses,
  applications,
}: {
  providerId: string;
  harnesses: Harness[];
  applications: Application[];
}) {
  const [conflict, setConflict] = useState<{ harness: Harness; message: string }>();
  const [conflictOpen, setConflictOpen] = useState(false);
  const nameOf = (harnessId: HarnessId) => harnesses.find((harness) => harness.id === harnessId)?.name ?? harnessId;

  const apply = useMutation(
    trpc.harnesses.apply.mutationOptions({
      onSuccess: async (_, { harnessId, replace }) => {
        await refreshProviders();
        setConflictOpen(false);
        const rewrite = applications.some((item) => item.harnessId === harnessId);
        toast.success(rewrite && !replace ? `已重新写入 ${nameOf(harnessId)}` : `已应用到 ${nameOf(harnessId)}`);
      },
      onError: (error, { harnessId }) => {
        const harness = harnesses.find((item) => item.id === harnessId);
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
  const stale = applications.filter((item) => item.state === 'modified' || item.state === 'missing');
  const triggerLabel = applications.length
    ? applications
        .map((item) =>
          item.state === 'applied'
            ? `已应用到 ${nameOf(item.harnessId)}`
            : `${nameOf(item.harnessId)} 中的配置${stateLabels[item.state]}`,
        )
        .join('；')
    : '应用到 Harness';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size={applications.length ? 'sm' : 'icon-sm'}
              className={cn(applications.length && 'gap-1.5 px-2')}
              aria-label={triggerLabel}
              title={triggerLabel}
            />
          }
        >
          {applications.length ? (
            applications.map((item) => (
              <span key={item.harnessId} className="relative flex">
                <HarnessGlyph id={item.harnessId} />
                {item.state !== 'applied' && (
                  <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive" />
                )}
              </span>
            ))
          ) : (
            <Boxes />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>应用到</DropdownMenuLabel>
            {harnesses.map((harness) => {
              const application = applications.find((item) => item.harnessId === harness.id);
              const hint = !harness.supported
                ? '暂不支持'
                : !harness.detected && !application
                  ? '未安装'
                  : application
                    ? stateLabels[application.state]
                    : '';
              return (
                <DropdownMenuCheckboxItem
                  key={harness.id}
                  checked={Boolean(application)}
                  disabled={pending || !harness.supported || (!harness.detected && !application)}
                  onCheckedChange={(checked) =>
                    checked
                      ? apply.mutate({ providerId, harnessId: harness.id, replace: false })
                      : unapply.mutate({ providerId, harnessId: harness.id })
                  }
                >
                  <HarnessGlyph id={harness.id} />
                  {harness.name}
                  {hint && <span className="ml-auto pl-4 text-xs text-muted-foreground">{hint}</span>}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuGroup>
          {stale.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {stale.map((item) => (
                <DropdownMenuItem
                  key={item.harnessId}
                  disabled={pending}
                  onClick={() => apply.mutate({ providerId, harnessId: item.harnessId, replace: false })}
                >
                  <RotateCcw />
                  重新写入 {nameOf(item.harnessId)}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
