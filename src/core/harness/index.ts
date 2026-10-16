import { dsh } from './dsh.ts';
import { opencode } from './opencode.ts';
import { pi } from './pi.ts';
import { type HarnessDescriptor, type HarnessId, harnessIds } from './types.ts';

export * from './types.ts';

const descriptors = { opencode, pi, dsh } satisfies Record<HarnessId, HarnessDescriptor>;

/** Supported harnesses in display order. */
export const harnesses: readonly HarnessDescriptor[] = harnessIds.map((id) => descriptors[id]);
