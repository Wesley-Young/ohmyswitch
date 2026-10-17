import { useSubscription } from '@trpc/tanstack-react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { queryClient, trpc } from '@/lib/trpc';

/** Opens the import page when an `ohmyswitch://` link arrives; reports links this version cannot handle. */
export function DeepLinkListener() {
  const navigate = useNavigate();
  useSubscription(
    trpc.deepLinks.events.subscriptionOptions(undefined, {
      onData: ({ data }) => {
        if (data.type === 'unsupported') {
          toast.error('无法识别这个链接，可能需要更新 ohmyswitch');
          return;
        }
        void queryClient.invalidateQueries(trpc.deepLinks.pending.queryFilter());
        navigate('/providers/import');
      },
    }),
  );
  return null;
}
