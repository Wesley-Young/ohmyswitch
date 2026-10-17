import { z } from 'zod';

import { endpoints } from '../../../core/endpoints.ts';
import { baseUrl, modelInfo, providerName } from '../../../core/provider.ts';

export const providerIdInput = z.object({ providerId: z.uuid() });

/** What is needed to reach a provider; also the input for fetching its models before it is saved. */
export const providerSourceInput = z.object({
  baseUrl,
  apiKey: z.string().trim().min(1, { error: '请填写 API Key' }).max(4096),
  endpoint: z.enum(endpoints, { error: '请选择端点' }),
});

export const createProviderInput = providerSourceInput.extend({
  name: providerName,
  models: z
    .array(modelInfo)
    .max(2000)
    .transform((models) => [...new Map(models.map((model) => [model.id, model])).values()]),
});

export const updateProviderInput = createProviderInput.extend(providerIdInput.shape);

export type ProviderSourceInput = z.infer<typeof providerSourceInput>;
export type CreateProviderInput = z.infer<typeof createProviderInput>;
export type UpdateProviderInput = z.infer<typeof updateProviderInput>;
