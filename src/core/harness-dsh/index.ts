import { harnessPlugin } from '#core/harnesses/index.ts';
import { dsh } from './descriptor.ts';

/** DeepSeek Harness, as described next to this file. The contract it implements is `docs/harness/dsh.md`. */
export const DshHarnessPlugin = harnessPlugin(dsh);
