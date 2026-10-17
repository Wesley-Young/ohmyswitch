import { z } from 'zod';

import type { Endpoint } from '../endpoints.ts';
import { AppError } from '../errors.ts';
import { BodyTooLargeError, type Fetch, readLimitedText } from '../http/fetch.ts';
import type { ModelInfo } from '../provider.ts';

/** Model list formats; the provider's endpoint decides which one to use. */
export type CatalogStyle = 'openai' | 'anthropic' | 'google';

export const catalogStyles = {
  '/v1/chat/completions': 'openai',
  '/v1/responses': 'openai',
  '/v1/messages': 'anthropic',
  '/v1beta/generateContent': 'google',
} as const satisfies Record<Endpoint, CatalogStyle>;

export interface CatalogSource {
  baseUrl: string;
  apiKey: string;
  endpoint: Endpoint;
}

const maxPages = 50;
const maxModels = 2000;
const maxPageBytes = 4 * 1024 * 1024;

const tokenLimit = z.number().int().positive().optional().catch(undefined);
const optionalText = z.string().optional().catch(undefined);

const openaiPage = z.object({
  data: z.array(
    // OpenRouter and some relays add context_length; the official API returns ids only.
    z.looseObject({ id: z.string(), context_length: tokenLimit }),
  ),
});

const anthropicPage = z.object({
  data: z.array(
    z.looseObject({ id: z.string(), display_name: optionalText, max_input_tokens: tokenLimit, max_tokens: tokenLimit }),
  ),
  has_more: z.boolean().optional(),
  last_id: z.string().nullish(),
});

const googlePage = z.object({
  models: z
    .array(
      z.looseObject({
        name: z.string(),
        displayName: optionalText,
        inputTokenLimit: tokenLimit,
        outputTokenLimit: tokenLimit,
        supportedGenerationMethods: z.array(z.string()).optional().catch(undefined),
      }),
    )
    .default([]),
  nextPageToken: z.string().optional(),
});

interface Page {
  models: ModelInfo[];
  next?: string;
}

interface StyleSpec {
  url: (base: string, cursor: string | undefined) => URL;
  headers: (apiKey: string) => Record<string, string>;
  parse: (body: unknown) => Page | undefined;
}

const model = (id: string, name: string | undefined, contextWindow?: number, maxOutput?: number): ModelInfo => ({
  id,
  ...(name && name !== id ? { name } : {}),
  ...(contextWindow ? { contextWindow } : {}),
  ...(maxOutput ? { maxOutput } : {}),
});

const specs: Record<CatalogStyle, StyleSpec> = {
  openai: {
    url: (base) => new URL(`${base}/v1/models`),
    headers: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
    parse: (body) => {
      const page = openaiPage.safeParse(body);
      if (!page.success) return undefined;
      return { models: page.data.data.map((item) => model(item.id, undefined, item.context_length)) };
    },
  },
  anthropic: {
    url: (base, cursor) => {
      const url = new URL(`${base}/v1/models`);
      url.searchParams.set('limit', '1000');
      if (cursor) url.searchParams.set('after_id', cursor);
      return url;
    },
    // New API style relays pick the Anthropic format only when both headers are present.
    headers: (apiKey) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
    parse: (body) => {
      const page = anthropicPage.safeParse(body);
      if (!page.success) return undefined;
      return {
        models: page.data.data.map((item) => model(item.id, item.display_name, item.max_input_tokens, item.max_tokens)),
        next: page.data.has_more ? (page.data.last_id ?? undefined) : undefined,
      };
    },
  },
  google: {
    url: (base, cursor) => {
      const url = new URL(`${base}/v1beta/models`);
      url.searchParams.set('pageSize', '1000');
      if (cursor) url.searchParams.set('pageToken', cursor);
      return url;
    },
    headers: (apiKey) => ({ 'x-goog-api-key': apiKey }),
    parse: (body) => {
      const page = googlePage.safeParse(body);
      if (!page.success) return undefined;
      return {
        models: page.data.models
          .filter(
            (item) => !item.supportedGenerationMethods || item.supportedGenerationMethods.includes('generateContent'),
          )
          .map((item) =>
            model(item.name.replace(/^models\//, ''), item.displayName, item.inputTokenLimit, item.outputTokenLimit),
          ),
        next: page.data.nextPageToken || undefined,
      };
    },
  },
};

/**
 * List the models a provider serves, using the model list format of its endpoint.
 * Results are deduplicated and sorted by id. Every failure is an AppError with a user-facing message.
 */
export async function fetchModelCatalog(source: CatalogSource, fetch: Fetch, signal: AbortSignal) {
  const style = catalogStyles[source.endpoint];
  const spec = specs[style];
  const models = new Map<string, ModelInfo>();
  const cursors = new Set<string>();
  let cursor: string | undefined;

  for (let pageIndex = 0; ; pageIndex++) {
    if (pageIndex >= maxPages) throw new AppError('bad_gateway', '供应商返回的模型列表分页过多');
    const page = spec.parse(
      await request(fetch, spec.url(source.baseUrl, cursor), spec.headers(source.apiKey), signal),
    );
    if (!page) throw new AppError('bad_gateway', '无法识别供应商返回的模型列表');
    for (const item of page.models) {
      if (item.id && item.id.length <= 256 && !models.has(item.id)) models.set(item.id, item);
    }
    if (models.size > maxModels) throw new AppError('bad_gateway', `供应商返回的模型超过 ${maxModels} 个`);
    if (!page.next) break;
    if (cursors.has(page.next)) throw new AppError('bad_gateway', '供应商返回的模型列表分页无效');
    cursors.add(page.next);
    cursor = page.next;
  }

  if (!models.size) throw new AppError('bad_gateway', '供应商没有返回可用模型');
  return { style, models: [...models.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

async function request(fetch: Fetch, url: URL, headers: Record<string, string>, signal: AbortSignal) {
  let response: Response;
  try {
    // Redirects are refused so the API key headers never follow the request to another host.
    response = await fetch(url.toString(), {
      headers: { accept: 'application/json', ...headers },
      signal,
      redirect: 'error',
    });
  } catch (error) {
    if (signal.aborted) throw new AppError('bad_gateway', '连接供应商超时，请稍后重试', { cause: error });
    throw new AppError('bad_gateway', '无法连接到供应商，请检查 Base URL 和网络', { cause: error });
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if (response.status === 401 || response.status === 403) {
      throw new AppError('bad_gateway', `API Key 无效或没有权限（HTTP ${response.status}）`);
    }
    if (response.status === 404)
      throw new AppError('bad_gateway', '供应商不支持获取模型列表（HTTP 404），请检查 Base URL');
    throw new AppError('bad_gateway', `获取模型失败，供应商返回 HTTP ${response.status}`);
  }
  let text: string;
  try {
    text = await readLimitedText(response, maxPageBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new AppError('bad_gateway', '供应商返回的模型列表过大');
    if (signal.aborted) throw new AppError('bad_gateway', '连接供应商超时，请稍后重试', { cause: error });
    throw new AppError('bad_gateway', '读取模型列表时连接中断', { cause: error });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new AppError('bad_gateway', '无法识别供应商返回的模型列表', { cause: error });
  }
}
