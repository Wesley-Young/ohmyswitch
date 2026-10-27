import { z } from 'zod';

import { endpoints } from './endpoints.ts';
import { harnessId } from './harnesses/types.ts';
import { vendors } from './vendors.ts';

export const providerName = z
  .string()
  .trim()
  .min(1, { error: '请填写名称' })
  .max(128, { error: '名称最多 128 个字符' });

/**
 * An http(s) root address without a trailing slash. A trailing `/v1` or `/v1beta` is dropped: endpoints and
 * harness adapters append the version path themselves, so keeping it would double it.
 */
export const baseUrl = z
  .string()
  .trim()
  .pipe(z.url({ protocol: /^https?$/, error: '请填写 http 或 https 地址' }))
  .transform((value) => value.replace(/\/+$/, '').replace(/\/(v1|v1beta)$/, ''));

/**
 * Where a provider's icon comes from: an image, or a web page whose declared icon is used. An empty value means
 * unset, in which case the icon of the Base URL's site is used.
 */
export const iconUrl = z
  .string()
  .trim()
  .max(2048, { error: '地址最多 2048 个字符' })
  .transform((value) => value || undefined)
  .pipe(z.url({ protocol: /^https?$/, error: '请填写 http 或 https 地址' }).optional());

/** Input kinds a model accepts. Text is always accepted; the others are listed when supported. */
export const modelInputs = ['text', 'image', 'pdf'] as const;

/** A native reasoning effort value, such as `low`, `xhigh` or `none`. */
export const reasoningEffort = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,32}$/, { error: '推理等级只能包含字母、数字、- 和 _' });

/**
 * How the model's API controls reasoning, in the models.dev format. Harness adapters translate these into their
 * own settings (Pi's `thinkingLevelMap`, OpenCode's `variants`); ohmyswitch stores them harness-neutral.
 * On a model, an empty list means reasoning cannot be controlled; an unset list means unknown.
 */
export const reasoningOption = z.discriminatedUnion('type', [
  /** Named effort levels, in increasing order. */
  z.object({ type: z.literal('effort'), values: z.array(reasoningEffort).min(1).max(16) }),
  /** Reasoning can be switched off. */
  z.object({ type: z.literal('toggle') }),
  /** A token budget for reasoning. */
  z.object({
    type: z.literal('budget_tokens'),
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().positive().optional(),
  }),
]);

/**
 * Whether reasoning must be sent back with later turns. `true` uses the protocol's own form; `field` names the
 * response field to echo, such as `reasoning_content` on OpenAI-compatible APIs.
 */
export const interleaved = z.union([z.literal(true), z.object({ field: z.string().regex(/^[a-z_]{1,64}$/) })]);

/**
 * A model and the metadata harness configs need. Every field but `id` is optional: unknown stays unset rather
 * than guessed, and harnesses fall back to their own defaults.
 */
export const modelInfo = z.object({
  id: z.string().min(1).max(256),
  name: z.string().max(256).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxOutput: z.number().int().positive().optional(),
  reasoning: z.boolean().optional(),
  reasoningOptions: z.array(reasoningOption).max(8).optional(),
  interleaved: interleaved.optional(),
  input: z.array(z.enum(modelInputs)).optional(),
  toolCall: z.boolean().optional(),
});

/** Both override scopes are limited to display name and token limits. */
export const modelOverride = modelInfo.pick({ name: true, contextWindow: true, maxOutput: true });
export type ModelOverride = z.infer<typeof modelOverride>;
export const providerModelOverride = modelOverride;
export type ProviderModelOverride = z.infer<typeof providerModelOverride>;

/** A provider as persisted. The API key is stored in plain text; harness configs hold it in plain text anyway. */
export const storedProvider = z.object({
  id: z.uuid(),
  name: providerName,
  /** The root address requests go to; endpoints are appended to it. */
  baseUrl,
  endpoint: z.enum(endpoints),
  /**
   * The model vendor, shown as the badge on the provider's icon and compared by import links. Unset means the
   * badge follows the endpoint. It is display information: it is not written into harness configs.
   */
  vendor: z.enum(vendors).optional(),
  apiKey: z.string(),
  /** An image or web page to take the icon from; unset uses the Base URL's site. */
  iconUrl: z.url({ protocol: /^https?$/ }).optional(),
  /** Metadata snapshots; discovery and models.dev sync never modify the separate overrides. */
  models: z.array(modelInfo),
  /** Kept when a model is deselected, so selecting it again restores its explicit settings. */
  modelOverrides: z.record(z.string().min(1).max(256), providerModelOverride).default({}),
  /**
   * The model ids the provider's model list held when the user last reviewed it. Models listed since are offered
   * as new, and saved models that were listed but no longer are offered for removal. Unset until the list is first
   * read; that first read only records it.
   */
  listedModels: z.array(z.string().min(1).max(256)).max(2000).optional(),
  /**
   * Harnesses this provider is applied to, with the key ohmyswitch owns in each harness config. Entries of
   * harnesses that are not registered are kept, so the application survives until the harness is back.
   */
  harnesses: z.record(harnessId, z.object({ key: z.string().min(1).max(64) })).default({}),
  createdAt: z.iso.datetime(),
});

/** Apply explicit fields in order: snapshot → global → provider. */
export function effectiveModel(
  model: ModelInfo,
  globalOverrides: Readonly<Record<string, ModelOverride>>,
  providerOverrides: Readonly<Record<string, ProviderModelOverride>> = {},
): ModelInfo {
  let result = model;
  for (const overrides of [globalOverrides, providerOverrides]) {
    const override = Object.hasOwn(overrides, model.id) ? overrides[model.id] : undefined;
    if (override)
      result = {
        ...result,
        ...Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined)),
      };
  }
  return result;
}

export type ModelInput = (typeof modelInputs)[number];
export type ReasoningOption = z.infer<typeof reasoningOption>;
export type ModelInfo = z.infer<typeof modelInfo>;
export type StoredProvider = z.infer<typeof storedProvider>;
