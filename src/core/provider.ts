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

export const modelInfo = z.object({
  id: z.string().min(1).max(256),
  name: z.string().max(256).optional(),
  contextWindow: z.number().int().positive().optional(),
  maxOutput: z.number().int().positive().optional(),
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
export type ModelInfo = z.infer<typeof modelInfo>;
export type StoredProvider = z.infer<typeof storedProvider>;
