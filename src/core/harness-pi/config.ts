import type { Endpoint } from '#core/endpoints.ts';
import { AppError } from '#core/errors.ts';
import type { HarnessAdapter } from '#core/harnesses/adapter.ts';
import { isJsonObject, type JsonObject, parseJsonc, setJsoncValue, withOwnedFields } from '#core/jsonc.ts';
import type { ModelInfo, StoredProvider } from '#core/provider.ts';

/**
 * Pi's `models.json`. The contract — which fields ohmyswitch owns and how they are derived — is documented in
 * `docs/harness/pi.md`; keep the two in sync.
 */

/** Built-in provider ids in Pi 1.3.0. A models.json entry with one of these keys merges into the built-in. */
const builtinProviders = new Set([
  'amazon-bedrock',
  'ant-ling',
  'anthropic',
  'azure',
  'baseten',
  'cerebras',
  'cloudflare-ai-gateway',
  'cloudflare-workers-ai',
  'deepseek',
  'fireworks',
  'github-copilot',
  'google',
  'google-vertex',
  'groq',
  'huggingface',
  'kimi-coding',
  'meta',
  'minimax',
  'minimax-cn',
  'mistral',
  'moonshotai',
  'moonshotai-cn',
  'nvidia',
  'openai',
  'openai-codex',
  'opencode',
  'opencode-go',
  'openrouter',
  'qwen-token-plan',
  'qwen-token-plan-cn',
  'qwen-token-plan-individual',
  'radius',
  'together',
  'typesafe',
  'vercel-ai-gateway',
  'xai',
  'xiaomi',
  'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'zai',
  'zai-coding-cn',
]);

type PiApi = 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-generative-ai';

/** Pi's API for each endpoint, and the path its client expects at the end of `baseUrl`. */
const apis = {
  '/v1/chat/completions': { api: 'openai-completions', path: '/v1' },
  '/v1/responses': { api: 'openai-responses', path: '/v1' },
  '/v1/messages': { api: 'anthropic-messages', path: '' },
  '/v1beta/generateContent': { api: 'google-generative-ai', path: '/v1beta' },
} as const satisfies Record<Endpoint, { api: PiApi; path: string }>;

const newFile = '{\n  "$schema": "https://pi.dev/schemas/models.schema.json",\n  "providers": {}\n}\n';

/**
 * Pi treats `apiKey` as a template: a leading `!` runs a command and `$NAME` reads an environment variable.
 * Escape a literal value so it is used as is.
 */
export function escapePiConfigValue(value: string) {
  const escaped = value.replaceAll('$', '$$$$');
  return escaped.startsWith('!') ? `$${escaped}` : escaped;
}

const graded = ['minimal', 'low', 'medium', 'high'] as const;
const extended = ['xhigh', 'max'] as const;

/** Pi's `thinkingLevelMap` for a model, or undefined when Pi's defaults apply. See the contract for the table. */
export function piThinkingLevelMap(model: ModelInfo): Record<string, string | null> | undefined {
  const options = model.reasoningOptions;
  if (!model.reasoning || !options) return undefined;
  const efforts = options.find((option) => option.type === 'effort')?.values;
  const hasToggle = options.some((option) => option.type === 'toggle');
  const map: Record<string, string | null> = {};
  if (efforts) {
    if (efforts.includes('none')) map.off = 'none';
    else if (!hasToggle) map.off = null;
    for (const level of graded) if (!efforts.includes(level)) map[level] = null;
    for (const level of extended) if (efforts.includes(level)) map[level] = level;
  } else if (options.some((option) => option.type === 'budget_tokens')) {
    return undefined;
  } else if (hasToggle) {
    for (const level of ['minimal', 'low', 'medium']) map[level] = null;
  } else {
    // No control at all: reasoning is always on, so only one level remains.
    for (const level of ['off', 'minimal', 'low', 'medium']) map[level] = null;
  }
  return Object.keys(map).length ? map : undefined;
}

const ownedModelFields = ['id', 'name', 'reasoning', 'thinkingLevelMap', 'input', 'contextWindow', 'maxTokens'];
const ownedCompatFields = ['forceAdaptiveThinking', 'requiresReasoningContentOnAssistantMessages'];

function piModel(model: ModelInfo, api: PiApi, existing: unknown): JsonObject {
  const efforts = model.reasoningOptions?.some((option) => option.type === 'effort');
  const interleavedField = typeof model.interleaved === 'object' ? model.interleaved.field : undefined;
  const input = model.input?.filter((kind) => kind === 'text' || kind === 'image');
  const target = withOwnedFields(existing, ownedModelFields, {
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    thinkingLevelMap: piThinkingLevelMap(model),
    input: input?.length ? input : undefined,
    contextWindow: model.contextWindow,
    maxTokens: model.maxOutput,
  });
  const compat = withOwnedFields(target.compat, ownedCompatFields, {
    forceAdaptiveThinking: api === 'anthropic-messages' && model.reasoning && efforts ? true : undefined,
    requiresReasoningContentOnAssistantMessages:
      api === 'openai-completions' && model.reasoning && interleavedField === 'reasoning_content' ? true : undefined,
  });
  if (Object.keys(compat).length) target.compat = compat;
  else delete target.compat;
  return target;
}

function piProviderEntry(provider: StoredProvider, existing: unknown): JsonObject {
  const { api, path } = apis[provider.endpoint];
  const previous = isJsonObject(existing) ? existing : {};
  const previousModels = new Map(
    (Array.isArray(previous.models) ? previous.models : [])
      .filter(isJsonObject)
      .map((model) => [model.id, model] as const),
  );
  return withOwnedFields(previous, ['name', 'baseUrl', 'api', 'apiKey', 'models'], {
    name: provider.name,
    baseUrl: `${provider.baseUrl}${path}`,
    api,
    apiKey: escapePiConfigValue(provider.apiKey),
    models: provider.models.map((model) => piModel(model, api, previousModels.get(model.id))),
  });
}

function readPiProviders(text: string | undefined): Record<string, unknown> {
  if (text === undefined || !text.trim()) return {};
  const config = parseJsonc(text);
  if (config === undefined) throw new AppError('precondition_failed', 'Pi 的 models.json 不是有效的 JSON，请先修复');
  if (!isJsonObject(config) || (config.providers !== undefined && !isJsonObject(config.providers))) {
    throw new AppError('precondition_failed', 'Pi 的 models.json 格式不正确，请先修复');
  }
  return (config.providers as JsonObject | undefined) ?? {};
}

function writePiProvider(text: string | undefined, key: string, entry: unknown) {
  let base = text === undefined || !text.trim() ? newFile : text;
  readPiProviders(base);
  const config = parseJsonc(base) as JsonObject;
  if (config.providers === undefined) {
    if (entry === undefined) return base;
    base = setJsoncValue(base, ['providers'], {});
  }
  return setJsoncValue(base, ['providers', key], entry);
}

export const piAdapter: HarnessAdapter = {
  readProviders: readPiProviders,
  entry: piProviderEntry,
  write: writePiProvider,
  reservedKeys: builtinProviders,
  // The file holds API keys.
  newFileMode: 0o600,
};
