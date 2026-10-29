import { cn } from 'cn';

import { formatTokens, type Model } from '@/lib/models';

/** A model's name and id. With `onOpen`, the name is a button. */
export function ModelTitle({ model, onOpen }: { model: Pick<Model, 'id' | 'name'>; onOpen?: () => void }) {
  const primary = model.name || model.id;
  const primaryClass = cn('truncate text-sm', model.name ? 'font-medium' : 'font-mono');

  return (
    <div className="flex min-w-0 items-baseline gap-2">
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
    </div>
  );
}

/** Context and output as `1M / 125K`. Fixed widths keep the slash in place from row to row. */
export function TokenLimits({ contextWindow, maxOutput }: Pick<Model, 'contextWindow' | 'maxOutput'>) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5 font-mono text-sm tabular-nums">
      <TokenCount value={contextWindow} className="w-12 text-right" />
      <span className="text-muted-foreground">/</span>
      <TokenCount value={maxOutput} className="w-12" />
    </span>
  );
}

function TokenCount({ value, className }: { value: number | undefined; className: string }) {
  return (
    <span className={cn(className, value === undefined && 'text-muted-foreground')}>
      {value === undefined ? '–' : formatTokens(value)}
    </span>
  );
}
