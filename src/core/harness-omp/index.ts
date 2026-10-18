import { harnessPlugin } from '#core/harnesses/index.ts';
import { omp } from './descriptor.ts';

/** omp, as described next to this file. The contract it implements is `docs/harness/omp.md`. */
export const OmpHarnessPlugin = harnessPlugin(omp);
