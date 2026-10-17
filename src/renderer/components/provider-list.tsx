import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { NavLink } from 'react-router';
import { toast } from 'sonner';

import { useHarnessFailures } from '@/components/harness-feedback';
import { HarnessGlyph } from '@/components/harness-icon';
import { ProviderAvatar } from '@/components/provider-avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formError, queryClient, type RouterOutputs, trpc } from '@/lib/trpc';

type Provider = RouterOutputs['providers']['list'][number];
type Application = RouterOutputs['harnesses']['applications'][string][number];

/** The left column: every provider, the selected one highlighted. */
export function ProviderList() {
  const providers = useQuery(trpc.providers.list.queryOptions());
  // Harness configs can change outside ohmyswitch, so their state is always read fresh.
  const applications = useQuery(trpc.harnesses.applications.queryOptions(undefined, { staleTime: 0 }));
  const info = useQuery(trpc.system.info.queryOptions(undefined, { staleTime: Number.POSITIVE_INFINITY }));

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <nav aria-label="供应商" className="min-h-0 flex-1 overflow-y-auto p-2">
        {providers.isPending ? (
          <ListSkeleton />
        ) : providers.isError ? (
          <div className="grid gap-2 p-2 text-sm">
            <span className="text-destructive">{formError(providers.error)?.message}</span>
            <Button variant="outline" size="sm" className="justify-self-start" onClick={() => providers.refetch()}>
              重试
            </Button>
          </div>
        ) : (
          <SortableProviders providers={providers.data} applications={applications.data ?? {}} />
        )}
      </nav>
      <div className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {info.data ? `v${info.data.version}` : '\u00a0'}
      </div>
    </aside>
  );
}

/**
 * The providers in their saved order. Dragging an item, or Space and the arrow keys on a focused one, reorders
 * them; the new order is shown at once and saved in the background, which also reorders the harness configs.
 */
function SortableProviders({
  providers,
  applications,
}: {
  providers: Provider[];
  applications: Record<string, Application[]>;
}) {
  const reportFailures = useHarnessFailures();
  const listKey = trpc.providers.list.queryKey();
  const reorder = useMutation(
    trpc.providers.reorder.mutationOptions({
      // Saves run one at a time in the order they were made, so the last drag is the order that sticks.
      scope: { id: 'providers.reorder' },
      onSuccess: ({ harnessFailures }) => reportFailures(harnessFailures, '顺序'),
      onError: (error) => {
        toast.error(formError(error)?.message);
        // Show the order that was actually saved.
        void queryClient.invalidateQueries({ queryKey: listKey });
      },
    }),
  );
  const sensors = useSensors(
    // A short movement is still a click, so items open as usual.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Enter opens the provider, so only Space picks an item up and puts it down.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = providers.findIndex((provider) => provider.id === active.id);
    const to = providers.findIndex((provider) => provider.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(providers, from, to);
    // A list request already in flight would answer with the old order and undo the move on screen.
    void queryClient.cancelQueries({ queryKey: listKey });
    queryClient.setQueryData(listKey, next);
    reorder.mutate({ providerIds: next.map((provider) => provider.id) });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      accessibility={{ announcements: announcements(providers), screenReaderInstructions }}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={providers.map((provider) => provider.id)} strategy={verticalListSortingStrategy}>
        {/* A grid column sizes to its widest item by default; minmax(0, 1fr) keeps items at the column width so
            long names truncate instead of scrolling the column sideways. */}
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {providers.map((provider) => (
            <ProviderItem key={provider.id} provider={provider} applications={applications[provider.id] ?? []} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

const screenReaderInstructions = {
  draggable: '按空格键拿起供应商，用上下方向键移动，再按空格键放下；按 Esc 取消。',
};

/** What screen readers hear while an item is moved, by provider name and 1-based position. */
function announcements(providers: Provider[]): Announcements {
  const nameOf = (id: UniqueIdentifier) => providers.find((provider) => provider.id === id)?.name ?? '';
  const positionOf = (id: UniqueIdentifier) => providers.findIndex((provider) => provider.id === id) + 1;
  const total = providers.length;
  return {
    onDragStart: ({ active }) => `已拿起「${nameOf(active.id)}」，第 ${positionOf(active.id)} 个，共 ${total} 个。`,
    onDragOver: ({ active, over }) => (over ? `「${nameOf(active.id)}」移到第 ${positionOf(over.id)} 个。` : undefined),
    onDragEnd: ({ active, over }) =>
      over ? `「${nameOf(active.id)}」已放在第 ${positionOf(over.id)} 个。` : `已放下「${nameOf(active.id)}」。`,
    onDragCancel: ({ active }) => `已取消，「${nameOf(active.id)}」回到第 ${positionOf(active.id)} 个。`,
  };
}

function ProviderItem({ provider, applications }: { provider: Provider; applications: Application[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: provider.id,
    // Items stay links for assistive technology; the instructions explain how to move them.
    attributes: { role: 'link' },
  });
  // `aria-roledescription` and `aria-pressed` would make screen readers announce a button instead of a link.
  const { 'aria-roledescription': _roleDescription, 'aria-pressed': _pressed, ...linkAttributes } = attributes;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10')}
    >
      <NavLink
        to={`/providers/${provider.id}`}
        // Links are natively draggable; that would start the browser's own drag instead of reordering.
        draggable={false}
        {...linkAttributes}
        {...listeners}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-sidebar-accent',
            isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
            isDragging && 'cursor-grabbing bg-sidebar-accent shadow-md ring-1 ring-border',
          )
        }
      >
        <ProviderAvatar providerId={provider.id} name={provider.name} endpoint={provider.endpoint} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{provider.name}</span>
            {applications.length > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                {applications.map((application) => (
                  <span
                    key={application.harnessId}
                    className={cn(
                      'flex',
                      // A harness whose config is out of sync is shown in the problem color.
                      application.state !== 'applied' && 'text-destructive',
                    )}
                  >
                    <HarnessGlyph id={application.harnessId} size={12} />
                  </span>
                ))}
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">{statusOf(provider)}</div>
        </div>
      </NavLink>
    </li>
  );
}

/** The item's second line: a short status for the provider. */
const statusOf = (provider: Provider) => (provider.modelCount ? `${provider.modelCount} 个模型` : '尚未配置模型');

function ListSkeleton() {
  return (
    <div className="grid gap-0.5">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3 px-2.5 py-2.5">
          <Skeleton className="size-9 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
