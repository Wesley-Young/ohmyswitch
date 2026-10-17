import { useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { useState } from 'react';

import { EndpointLogo } from '@/components/endpoint-logo';
import type { Endpoint } from '@/lib/endpoints';
import { trpc } from '@/lib/trpc';

/**
 * The provider's icon, or its initial while there is none, with the vendor logo of its endpoint in the
 * bottom-right corner. Both take the same box, so the icon arriving does not move anything.
 */
export function ProviderAvatar({
  providerId,
  name,
  endpoint,
  size = 'default',
}: {
  providerId: string;
  name: string;
  endpoint: Endpoint;
  size?: 'default' | 'lg';
}) {
  const large = size === 'lg';
  // The server keeps icons fresh; within a session one read per provider is enough.
  const icon = useQuery(trpc.icons.get.queryOptions({ providerId }, { staleTime: 60 * 60 * 1000 }));
  const [broken, setBroken] = useState<string>();
  const src = icon.data && icon.data !== broken ? icon.data : undefined;

  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          'flex items-center justify-center overflow-hidden border font-medium uppercase',
          src ? 'bg-background' : 'bg-muted',
          large ? 'size-12 rounded-2xl text-base' : 'size-9 rounded-xl text-sm',
        )}
      >
        {src ? (
          <img src={src} alt="" draggable={false} className="size-full object-contain" onError={() => setBroken(src)} />
        ) : (
          name.slice(0, 1)
        )}
      </div>
      <EndpointLogo
        endpoint={endpoint}
        size={large ? 14 : 12}
        className={cn('absolute -right-1 -bottom-1 ring-2 ring-background', large ? 'size-4.5' : 'size-3.5')}
      />
    </div>
  );
}
