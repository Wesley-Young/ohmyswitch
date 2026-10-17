import { harnessPlugin } from '#core/harnesses/index.ts';
import { opencode } from './descriptor.ts';

/** OpenCode, as described next to this file. The contract it implements is `docs/harness/opencode.md`. */
export const OpenCodeHarnessPlugin = harnessPlugin(opencode);
