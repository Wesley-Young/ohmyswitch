import { cn } from 'cn';

import { formatTokens, type Model } from '@/lib/models';

/** A model's name and id. With `onOpen`, the name is a button. */
export function ModelTitle({
  model,
  onOpen,
  stacked = false,
}: {
  model: Pick<Model, 'id' | 'name'>;
  onOpen?: () => void;
  stacked?: boolean;
}) {
  const primary = model.name || model.id;
  const primaryClass = cn('truncate text-sm', model.name ? 'font-medium' : 'font-mono');

  return (
    <span className={cn('min-w-0', stacked ? 'grid gap-0.5' : 'flex items-baseline gap-2')}>
      {onOpen ? (
        <button
          type="button"
          className={cn(
            primaryClass,
            'min-w-0 cursor-pointer rounded-sm text-left outline-none transition-colors hover:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
          )}
          title={primary}
          onClick={onOpen}
        >
          {primary}
        </button>
      ) : (
        <span className={primaryClass} title={primary}>
          {primary}
        </span>
      )}
      {model.name && (
        <span className="truncate font-mono text-xs text-muted-foreground" title={model.id}>
          {model.id}
        </span>
      )}
    </span>
  );
}

/** Context and output as `1M / 125K`. Fixed widths keep the slash in place from row to row. */
export function TokenLimits({
  contextWindow,
  maxOutput,
  compact = false,
}: Pick<Model, 'contextWindow' | 'maxOutput'> & { compact?: boolean }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-baseline font-mono tabular-nums',
        compact ? 'gap-1 text-xs' : 'gap-1.5 text-sm',
      )}
      title="上下文 / 最大输出"
    >
      <span className="sr-only">上下文</span>
      <TokenCount value={contextWindow} className={compact ? undefined : 'w-12 text-right'} />
      <span className="text-muted-foreground" aria-hidden="true">
        /
      </span>
      <span className="sr-only">最大输出</span>
      <TokenCount value={maxOutput} className={compact ? undefined : 'w-12'} />
    </span>
  );
}

function TokenCount({ value, className }: { value: number | undefined; className?: string }) {
  return (
    <span className={cn(className, value === undefined && 'text-muted-foreground')}>
      {value === undefined ? '–' : formatTokens(value)}
    </span>
  );
}
