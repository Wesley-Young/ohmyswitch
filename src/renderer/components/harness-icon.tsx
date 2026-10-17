// Deep imports keep the SVG components only: the package entry pulls in antd and @lobehub/ui.
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Mono.js';
import OpenCode from '@lobehub/icons/es/OpenCode/components/Mono.js';
import Pi from '@lobehub/icons/es/Pi/components/Mono.js';
import { cn } from 'cn';

import type { RouterOutputs } from '@/lib/trpc';

export type HarnessId = RouterOutputs['harnesses']['list'][number]['id'];

/** Monochrome logos drawn with currentColor, so they follow the theme. */
const icons = { opencode: OpenCode, pi: Pi, dsh: DeepSeek } satisfies Record<HarnessId, typeof OpenCode>;

export function HarnessIcon({ id, className }: { id: HarnessId; className?: string }) {
  const Icon = icons[id];
  return (
    <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-md border bg-background', className)}>
      <Icon size={18} aria-hidden />
    </div>
  );
}

/** The bare logo, for inline use next to text. */
export function HarnessGlyph({ id, size = 14, className }: { id: HarnessId; size?: number; className?: string }) {
  const Icon = icons[id];
  return <Icon size={size} className={className} aria-hidden />;
}
