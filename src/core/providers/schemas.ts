import { z } from 'zod';

import { endpoints } from '#core/endpoints.ts';
import { harnessId } from '#core/harnesses/types.ts';
import { baseUrl, iconUrl, modelInfo, providerName } from '#core/provider.ts';

export const providerIdInput = z.object({ providerId: z.uuid() });

/** The connection fields of a provider, edited and saved together. */
const connectionInput = z.object({
  name: providerName,
  baseUrl,
  apiKey: z.string().trim().min(1, { error: '请填写 API Key' }).max(4096),
  endpoint: z.enum(endpoints, { error: '请选择端点' }),
  /** Unset or empty uses the icon of the Base URL's site. */
  iconUrl: iconUrl.optional(),
});

export const createProviderInput = connectionInput.extend({
  /** Models to start with, such as those an import link lists; their metadata is filled from models.dev. */
  modelIds: z
    .array(z.string().trim().min(1).max(256))
    .max(2000)
    .optional()
    .transform((ids) => (ids ? [...new Set(ids)] : undefined)),
});

export const updateProviderInput = connectionInput.extend(providerIdInput.shape);

/** Every provider id, in the new order of the provider list. */
export const reorderInput = z.object({
  providerIds: z
    .array(z.uuid())
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length, { error: '供应商顺序中有重复项' }),
});

/** The provider's complete model list, replacing the stored one. */
export const setModelsInput = providerIdInput.extend({
  models: z
    .array(modelInfo)
    .max(2000)
    .transform((models) => [...new Map(models.map((model) => [model.id, model])).values()]),
});

const modelId = z.string().min(1).max(256);

/**
 * The outcome of choosing which of the provider's listed models to keep: the list as it was shown, and the ids
 * chosen from it. Saved models the list does not include are kept.
 */
export const pickModelsInput = providerIdInput.extend({
  listed: z.array(modelInfo).max(2000),
  selected: z
    .array(modelId)
    .max(2000)
    .transform((ids) => [...new Set(ids)]),
});

/**
 * The outcome of reviewing how the provider's model list changed: models to add and remove, and the list as it
 * was reviewed, which later changes are measured against.
 */
export const reviewModelsInput = providerIdInput.extend({
  add: z.array(modelInfo).max(2000),
  remove: z.array(modelId).max(2000),
  listed: z
    .array(modelId)
    .max(2000)
    .transform((ids) => [...new Set(ids)]),
});

/** One entry to import from a harness: the harness and the key of the entry in its config. */
const importSource = z.object({ harnessId, key: z.string().min(1).max(64) });

/** Import candidates, each named by the harness entries it was found in, as `harnessImports` lists them. */
export const importFromHarnessesInput = z.object({
  candidates: z
    .array(z.object({ sources: z.array(importSource).min(1).max(16) }))
    .min(1, { error: '请选择要导入的供应商' })
    .max(200),
});

export type CreateProviderInput = z.infer<typeof createProviderInput>;
export type ReviewModelsInput = z.infer<typeof reviewModelsInput>;
export type PickModelsInput = z.infer<typeof pickModelsInput>;
export type ImportFromHarnessesInput = z.infer<typeof importFromHarnessesInput>;
export type UpdateProviderInput = z.infer<typeof updateProviderInput>;
export type SetModelsInput = z.infer<typeof setModelsInput>;
export type ReorderInput = z.infer<typeof reorderInput>;
