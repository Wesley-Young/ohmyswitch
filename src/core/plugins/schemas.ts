import { z } from 'zod';

/** An entry id. Whether it exists is checked by the service. */
const entryId = z.string().min(1);

export const setEnabledInput = z.object({ id: entryId, enabled: z.boolean() });
