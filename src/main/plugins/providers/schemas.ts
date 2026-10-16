import { z } from 'zod';

import { endpoints } from '../../../core/endpoints.ts';
import { baseUrl, providerName } from '../../../core/provider.ts';

export const createProviderInput = z.object({
  name: providerName,
  baseUrl,
  apiKey: z.string().trim().min(1, { error: '请填写 API Key' }).max(4096),
  endpoints: z
    .array(z.enum(endpoints))
    .min(1, { error: '至少选择一个端点' })
    .transform((selected) => endpoints.filter((endpoint) => selected.includes(endpoint))),
});

export const providerIdInput = z.object({ providerId: z.uuid() });

export type CreateProviderInput = z.infer<typeof createProviderInput>;
