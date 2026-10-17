import { z } from 'zod';

import { endpoints } from '../endpoints.ts';
import { baseUrl, iconUrl, modelInfo, providerName } from '../provider.ts';

export const providerIdInput = z.object({ providerId: z.uuid() });

/** The connection fields of a provider, edited and saved together. */
export const createProviderInput = z.object({
  name: providerName,
  baseUrl,
  apiKey: z.string().trim().min(1, { error: '请填写 API Key' }).max(4096),
  endpoint: z.enum(endpoints, { error: '请选择端点' }),
  /** Unset or empty uses the icon of the Base URL's site. */
  iconUrl: iconUrl.optional(),
});

export const updateProviderInput = createProviderInput.extend(providerIdInput.shape);

/** The provider's complete model list, replacing the stored one. */
export const setModelsInput = providerIdInput.extend({
  models: z
    .array(modelInfo)
    .max(2000)
    .transform((models) => [...new Map(models.map((model) => [model.id, model])).values()]),
});

export type CreateProviderInput = z.infer<typeof createProviderInput>;
export type UpdateProviderInput = z.infer<typeof updateProviderInput>;
export type SetModelsInput = z.infer<typeof setModelsInput>;
