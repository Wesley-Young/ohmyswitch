import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { type RouterOutputs, trpc } from '@/lib/trpc';

type Saved = Pick<RouterOutputs['providers']['update'], 'harnesses' | 'harnessFailures'>;
type Failure = Saved['harnessFailures'][number];

/** Harness names by id, falling back to the id while the list loads or for a harness that is gone. */
function useHarnessName() {
  const harnesses = useQuery(trpc.harnesses.list.queryOptions());
  return (harnessId: string) => harnesses.data?.find((harness) => harness.id === harnessId)?.name ?? harnessId;
}

/**
 * Report harnesses that could not be written, one error each. `context` names what was being written, such as
 * 「顺序」; repeated reports with the same context replace the earlier toast of that harness instead of stacking.
 */
export function useHarnessFailures() {
  const nameOf = useHarnessName();
  return (failures: readonly Failure[], context?: string) => {
    for (const failure of failures) {
      const what = context ? `${nameOf(failure.harnessId)} 的${context}` : nameOf(failure.harnessId);
      toast.error(`未能更新 ${what}：${failure.message}`, context ? { id: `${context}:${failure.harnessId}` } : {});
    }
  };
}

/**
 * Report a save that also rewrote the harness configs: one success message naming the harnesses that were
 * updated, then one error per harness that could not be written.
 */
export function useHarnessFeedback() {
  const nameOf = useHarnessName();
  const reportFailures = useHarnessFailures();

  return (message: string, saved: Saved, options?: Parameters<typeof toast.success>[1]) => {
    const failed = new Set(saved.harnessFailures.map((failure) => failure.harnessId));
    const updated = saved.harnesses.filter((harnessId) => !failed.has(harnessId)).map(nameOf);
    toast.success(updated.length ? `${message}，并更新了 ${updated.join('、')}` : message, options);
    reportFailures(saved.harnessFailures);
  };
}
