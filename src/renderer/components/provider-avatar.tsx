import { cn } from 'cn';

import { EndpointLogo } from '@/components/endpoint-logo';
import type { Endpoint } from '@/lib/endpoints';

/** The provider's initial, with the vendor logo of its endpoint in the bottom-right corner. */
export function ProviderAvatar({
  name,
  endpoint,
  size = 'default',
}: {
  name: string;
  endpoint: Endpoint;
  size?: 'default' | 'lg';
}) {
  const large = size === 'lg';
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          'flex items-center justify-center rounded-full border bg-muted font-medium uppercase',
          large ? 'size-12 text-base' : 'size-9 text-sm',
        )}
      >
        {name.slice(0, 1)}
      </div>
      <EndpointLogo
        endpoint={endpoint}
        size={large ? 14 : 12}
        className={cn('absolute -right-1 -bottom-1 ring-2 ring-background', large ? 'size-6' : 'size-5')}
      />
    </div>
  );
}
