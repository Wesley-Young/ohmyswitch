// Deep imports keep the SVG components only: the package entry pulls in antd and @lobehub/ui.
import ClaudeColor from '@lobehub/icons/es/Claude/components/Color.js';
import GeminiColor from '@lobehub/icons/es/Gemini/components/Color.js';
import OpenAIMono from '@lobehub/icons/es/OpenAI/components/Mono.js';
import { cn } from 'cn';

import { type Endpoint, endpointLabels } from '@/lib/endpoints';

/**
 * Vendors are shown in color. OpenAI's mark has no color version (the brand is monochrome), so it is drawn in
 * the foreground color.
 */
const logos = {
  '/v1/chat/completions': OpenAIMono,
  '/v1/responses': OpenAIMono,
  '/v1/messages': ClaudeColor,
  '/v1beta/generateContent': GeminiColor,
} satisfies Record<Endpoint, typeof OpenAIMono>;

/** The vendor logo of the protocol a provider speaks, as a small tile. */
export function EndpointLogo({
  endpoint,
  size = 11,
  className,
}: {
  endpoint: Endpoint;
  /** Logo size in pixels; the tile is sized with `className`. */
  size?: number;
  className?: string;
}) {
  const Icon = logos[endpoint];
  return (
    <span
      role="img"
      aria-label={endpointLabels[endpoint]}
      title={endpointLabels[endpoint]}
      className={cn('flex size-4 items-center justify-center rounded-full bg-background text-foreground', className)}
    >
      <Icon size={size} aria-hidden />
    </span>
  );
}
