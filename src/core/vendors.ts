/**
 * The model vendor a provider serves. It is shown as the badge on the provider's icon, and an import link names it
 * to update an existing provider. The order is the display order; append new vendors at the end.
 */
export const vendors = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'qwen',
  'moonshot',
  'zhipu',
  'xai',
  'mistral',
  'meta',
  'groq',
  'minimax',
  'doubao',
  'hunyuan',
  'baidu',
  'openrouter',
  'siliconcloud',
  'stepfun',
  'cohere',
  'yi',
  'baichuan',
] as const;

export type Vendor = (typeof vendors)[number];
