import { opencode } from './opencode.ts';
import { pi } from './pi.ts';
import { type HarnessDescriptor, type HarnessId, harnessIds } from './types.ts';

export * from './adapter.ts';
export * from './types.ts';

// DeepSeek Harness (dsh.ts) is not listed until its adapter and contract exist.
const descriptors = { opencode, pi } satisfies Record<HarnessId, HarnessDescriptor>;

/** Supported harnesses in display order. */
export const harnesses: readonly HarnessDescriptor[] = harnessIds.map((id) => descriptors[id]);
