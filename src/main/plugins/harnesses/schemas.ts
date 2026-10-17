import { z } from 'zod';

import { harnessIds } from '../../../core/harness/index.ts';

export const applicationInput = z.object({ providerId: z.uuid(), harnessId: z.enum(harnessIds) });

export const applyInput = applicationInput.extend({
  /** Take over an existing entry with the same key that ohmyswitch does not own. */
  replace: z.boolean().default(false),
});
