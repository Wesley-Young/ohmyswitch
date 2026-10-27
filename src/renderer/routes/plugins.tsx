import { useMutation, useQuery } from '@tanstack/react-query';
import { Puzzle } from 'lucide-react';
import { toast } from 'sonner';

import { HarnessIcon } from '@/components/harness-icon';
import { PageContent, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { refreshPlugins } from '@/lib/cache';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type Entry = RouterOutputs['plugins']['list']['entries'][number];

/**
 * States that need a word. A running plugin needs none, a disabled one shows it with its switch, and a failed one
 * shows its error instead.
 */
const stateLabels = {
  active: '',
  disabled: '',
  pending: '加载中',
  loading: '加载中',
  failed: '',
} satisfies Record<Entry['state'], string>;

/** The plugins: enable and disable them. Changes are saved to plugins.yml; plugins.patch.yml can override them. */
export default function Plugins() {
  const plugins = useQuery(trpc.plugins.list.queryOptions(undefined, { staleTime: 0 }));
  const setEnabled = useMutation(
    trpc.plugins.setEnabled.mutationOptions({
      onSuccess: async (_, { id, enabled }) => {
        await refreshPlugins();
        const title = plugins.data?.entries.find((entry) => entry.id === id)?.title ?? id;
        toast.success(enabled ? `已启用 ${title}` : `已停用 ${title}`);
      },
      onError: (error) => toast.error(formError(error)?.message),
    }),
  );

  const content = () => {
    if (plugins.isPending) return <Skeleton className="h-44 w-full rounded-lg" />;
    if (plugins.isError) {
      return (
        <div className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
          <span className="text-destructive">{formError(plugins.error)?.message}</span>
          <Button variant="outline" size="sm" onClick={() => void plugins.refetch()}>
            重试
          </Button>
        </div>
      );
    }
    const { entries, fileError, patchError } = plugins.data;
    const row = (entry: Entry) => (
      <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
        <HarnessIcon
          id={entry.pluginId ?? entry.id}
          className={entry.enabled ? undefined : 'text-muted-foreground opacity-60'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{entry.title}</span>
            {stateLabels[entry.state] && <Badge variant="secondary">{stateLabels[entry.state]}</Badge>}
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground" title={entry.id}>
            {entry.id}
          </div>
          {entry.error && <div className="text-xs text-destructive">{entry.error}</div>}
          {entry.locked && <div className="text-xs text-muted-foreground">由 plugins.patch.yml 决定</div>}
        </div>
        <Switch
          aria-label={`启用 ${entry.title}`}
          checked={entry.enabled}
          disabled={setEnabled.isPending || entry.locked || Boolean(fileError || patchError)}
          onCheckedChange={(enabled) => setEnabled.mutate({ id: entry.id, enabled })}
        />
      </li>
    );
    return (
      <div className="grid gap-4">
        <FileError file="plugins.yml" error={fileError} />
        <FileError file="plugins.patch.yml" error={patchError} />
        {entries.length > 0 ? (
          <ul className="divide-y rounded-lg border bg-card">{entries.map(row)}</ul>
        ) : (
          <Empty className="border py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Puzzle />
              </EmptyMedia>
              <EmptyTitle>没有插件</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeader title="插件">
        {plugins.data && (
          <div className="truncate font-mono text-xs text-muted-foreground" title={plugins.data.path}>
            {plugins.data.path}
          </div>
        )}
      </PageHeader>
      <PageContent>{content()}</PageContent>
    </>
  );
}

/** A file that cannot be read: what that means for the plugins, and the parser's message to fix it by. */
function FileError({ file, error }: { file: string; error: string | null }) {
  if (!error) return null;
  return (
    <div className="grid gap-1 rounded-lg border border-destructive/40 px-4 py-3 text-sm">
      <span className="text-destructive">{file} 有错误，修正前沿用上次读取的配置</span>
      <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">{error}</pre>
    </div>
  );
}
