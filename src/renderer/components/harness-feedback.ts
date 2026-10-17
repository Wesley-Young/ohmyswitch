import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { type RouterOutputs, trpc } from '@/lib/trpc';

type Saved = Pick<RouterOutputs['providers']['update'], 'harnesses' | 'harnessFailures'>;

/**
 * Report a save that also rewrote the harness configs: one success message naming the harnesses that were
 * updated, then one error per harness that could not be written.
 */
export function useHarnessFeedback() {
  const harnesses = useQuery(trpc.harnesses.list.queryOptions());
  const nameOf = (harnessId: string) => harnesses.data?.find((harness) => harness.id === harnessId)?.name ?? harnessId;

  return (message: string, saved: Saved, options?: Parameters<typeof toast.success>[1]) => {
    const failed = new Set(saved.harnessFailures.map((failure) => failure.harnessId));
    const updated = saved.harnesses.filter((harnessId) => !failed.has(harnessId)).map(nameOf);
    toast.success(updated.length ? `${message}，并更新了 ${updated.join('、')}` : message, options);
    for (const failure of saved.harnessFailures) {
      toast.error(`未能更新 ${nameOf(failure.harnessId)}：${failure.message}`);
    }
  };
}
