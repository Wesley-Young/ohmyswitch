import { z } from 'zod';

import { endpoints } from './endpoints.ts';

export const providerName = z
  .string()
  .trim()
  .min(1, { error: '请填写名称' })
  .max(128, { error: '名称最多 128 个字符' });

/** An http(s) root address without a trailing slash. */
export const baseUrl = z
  .string()
  .trim()
  .pipe(z.url({ protocol: /^https?$/, error: '请填写 http 或 https 地址' }))
  .transform((value) => value.replace(/\/+$/, ''));

export const accessPoint = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(64),
  baseUrl,
});

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
  accessPoints: z.array(accessPoint).min(1),
  endpoint: z.enum(endpoints),
  apiKey: z.string(),
  models: z.array(modelInfo),
  createdAt: z.iso.datetime(),
});

export type AccessPoint = z.infer<typeof accessPoint>;
export type ModelInput = (typeof modelInputs)[number];
export type ReasoningOption = z.infer<typeof reasoningOption>;
export type ModelInfo = z.infer<typeof modelInfo>;
export type StoredProvider = z.infer<typeof storedProvider>;
