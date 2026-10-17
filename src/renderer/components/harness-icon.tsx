// Deep imports keep the SVG components only: the package entry pulls in antd and @lobehub/ui.
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Mono.js';
import OpenCode from '@lobehub/icons/es/OpenCode/components/Mono.js';
import Pi from '@lobehub/icons/es/Pi/components/Mono.js';
import { cn } from 'cn';
import { SquareTerminal } from 'lucide-react';
import type { ComponentType } from 'react';

import type { RouterOutputs } from '@/lib/trpc';

export type HarnessId = RouterOutputs['harnesses']['list'][number]['id'];

type Icon = ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;

/**
 * Monochrome logos drawn with currentColor, so they follow the theme. Harnesses are registered by plugins, so the
 * set is open: one without a logo here gets a generic icon.
 */
const icons: Partial<Record<HarnessId, Icon>> = { opencode: OpenCode, pi: Pi, dsh: DeepSeek };

const iconOf = (id: HarnessId) => icons[id] ?? SquareTerminal;

export function HarnessIcon({ id, className }: { id: HarnessId; className?: string }) {
  const Icon = iconOf(id);
  return (
    <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-md border bg-background', className)}>
      <Icon size={18} aria-hidden />
    </div>
  );
}

/** The bare logo, for inline use next to text. */
export function HarnessGlyph({ id, size = 14, className }: { id: HarnessId; size?: number; className?: string }) {
  const Icon = iconOf(id);
  return <Icon size={size} className={className} aria-hidden />;
}
