import type { Endpoint } from './endpoints';
import type { RouterOutputs } from './trpc';

export type Vendor = NonNullable<RouterOutputs['providers']['list'][number]['vendor']>;

/** Vendor names, shown as they are; the key order is the display order. */
export const vendorLabels = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  moonshot: 'Moonshot',
  zhipu: 'Zhipu',
  xai: 'xAI',
  mistral: 'Mistral',
  meta: 'Meta',
  groq: 'Groq',
  minimax: 'MiniMax',
  doubao: 'Doubao',
  hunyuan: 'Hunyuan',
  baidu: 'Baidu',
  openrouter: 'OpenRouter',
  siliconcloud: 'SiliconCloud',
  stepfun: 'StepFun',
  cohere: 'Cohere',
  yi: 'Yi',
  baichuan: 'Baichuan',
} satisfies Record<Vendor, string>;

export const vendors = Object.keys(vendorLabels) as Vendor[];

/** The vendor a provider without one is shown as. */
export const endpointVendors = {
  '/v1/chat/completions': 'openai',
  '/v1/responses': 'openai',
  '/v1/messages': 'anthropic',
  '/v1beta/generateContent': 'google',
} satisfies Record<Endpoint, Vendor>;

/** The vendor of a provider's badge: the one chosen, or else the one its endpoint implies. */
export const vendorOf = (provider: { endpoint: Endpoint; vendor?: Vendor }) =>
  provider.vendor ?? endpointVendors[provider.endpoint];
