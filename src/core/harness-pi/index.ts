import { harnessPlugin } from '#core/harnesses/index.ts';
import { pi } from './descriptor.ts';

/** Pi, as described next to this file. The contract it implements is `docs/harness/pi.md`. */
export const PiHarnessPlugin = harnessPlugin(pi);
