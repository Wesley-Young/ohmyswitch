import { z } from 'zod';

export const pendingImportInput = z.object({ id: z.uuid() });

/** Set by the subscription transport on reconnect: the id of the last event the client received. */
export const eventsInput = z.object({ lastEventId: z.string().nullish() }).optional();
