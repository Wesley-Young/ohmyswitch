import type { HarnessAdapter } from './adapter.ts';
import { dsh } from './dsh.ts';
import { opencode } from './opencode.ts';
import { pi } from './pi.ts';
import { piAdapter } from './pi-config.ts';
import { type HarnessDescriptor, type HarnessId, harnessIds } from './types.ts';

export * from './adapter.ts';
export * from './types.ts';

const descriptors = { opencode, pi, dsh } satisfies Record<HarnessId, HarnessDescriptor>;

/** Supported harnesses in display order. */
export const harnesses: readonly HarnessDescriptor[] = harnessIds.map((id) => descriptors[id]);

/** Harnesses ohmyswitch can write providers into. The others are listed but not yet supported. */
export const adapters: Partial<Record<HarnessId, HarnessAdapter>> = { pi: piAdapter };
