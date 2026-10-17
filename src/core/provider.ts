import { z } from 'zod';

import { endpoints } from './endpoints.ts';
import { harnessId } from './harnesses/types.ts';

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

/** A provider as persisted. The API key is stored in plain text; harness configs hold it in plain text anyway. */
export const storedProvider = z.object({
  id: z.uuid(),
  name: providerName,
  /** The root address requests go to; endpoints are appended to it. */
  baseUrl,
  endpoint: z.enum(endpoints),
  apiKey: z.string(),
  /** An image or web page to take the icon from; unset uses the Base URL's site. */
  iconUrl: z.url({ protocol: /^https?$/ }).optional(),
  models: z.array(modelInfo),
  /**
   * Harnesses this provider is applied to, with the key ohmyswitch owns in each harness config. Entries of
   * harnesses that are not registered are kept, so the application survives until the harness is back.
   */
  harnesses: z.record(harnessId, z.object({ key: z.string().min(1).max(64) })).default({}),
  createdAt: z.iso.datetime(),
});

export type ModelInput = (typeof modelInputs)[number];
export type ReasoningOption = z.infer<typeof reasoningOption>;
export type ModelInfo = z.infer<typeof modelInfo>;
export type StoredProvider = z.infer<typeof storedProvider>;
