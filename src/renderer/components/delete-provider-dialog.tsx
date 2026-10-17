import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

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
import { refreshProviders } from '@/lib/cache';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type Provider = RouterOutputs['providers']['list'][number];

export function DeleteProviderDialog({
  provider,
  open,
  onOpenChange,
  onDeleted,
}: {
  provider: Provider | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const harnesses = useQuery(trpc.harnesses.list.queryOptions());
  const applied = (provider?.harnesses ?? []).map(
    (harnessId) => harnesses.data?.find((harness) => harness.id === harnessId)?.name ?? harnessId,
  );
  const remove = useMutation(
    trpc.providers.delete.mutationOptions({
      onSuccess: async () => {
        onOpenChange(false);
        toast.success(`已删除「${provider?.name}」`);
        onDeleted?.();
        await refreshProviders();
      },
      onError: (error) => toast.error(formError(error)?.message),
    }),
  );
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除「{provider?.name}」？</AlertDialogTitle>
          <AlertDialogDescription>
            {applied.length
              ? `会同时从 ${applied.join('、')} 的配置中移除。`
              : '只从 ohmyswitch 中删除，不会改动各 Harness 的配置文件。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!provider || remove.isPending}
            onClick={() => provider && remove.mutate({ providerId: provider.id })}
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
