import { z } from 'zod';

import { harnessId } from './types.ts';

/** Whether the harness is registered is checked by the service, which reports an unknown one as not found. */
export const applicationInput = z.object({ providerId: z.uuid(), harnessId });

export const providerInput = z.object({ providerId: z.uuid() });

/** Harnesses to remove a provider from at once, such as those one 应用所有 just applied it to. */
export const unapplyManyInput = providerInput.extend({ harnessIds: z.array(harnessId).min(1).max(64) });

export const applyInput = applicationInput.extend({
  /** Take over an existing entry with the same key that ohmyswitch does not own. */
  replace: z.boolean().default(false),
});
