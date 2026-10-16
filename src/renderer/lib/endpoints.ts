import type { RouterOutputs } from './trpc';

export type Endpoint = RouterOutputs['providers']['list'][number]['endpoints'][number];

/** Protocol names shown for each endpoint; the key order is the display order. */
export const endpointLabels = {
  '/v1/chat/completions': 'OpenAI Chat Completions',
  '/v1/responses': 'OpenAI Responses',
  '/v1/messages': 'Anthropic Messages',
  '/v1beta/generateContent': 'Google Generative AI',
} satisfies Record<Endpoint, string>;

export const endpoints = Object.keys(endpointLabels) as Endpoint[];
