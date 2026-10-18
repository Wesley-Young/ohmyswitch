import type { Endpoint } from '#core/endpoints.ts';
import { AppError } from '#core/errors.ts';
import type { HarnessAdapter } from '#core/harnesses/adapter.ts';
import {
  endpointBy,
  type HarnessImport,
  importedBaseUrl,
  importedModels,
  notImportable,
} from '#core/harnesses/import.ts';
import {
  isJsonObject,
  type JsonObject,
  parseJsonc,
  reorderJsoncProperties,
  setJsoncValue,
  withOwnedFields,
} from '#core/jsonc.ts';
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

function reorderPiProviders(text: string | undefined, keys: readonly string[]) {
  if (text === undefined || !text.trim()) return text;
  readPiProviders(text);
  return reorderJsoncProperties(text, ['providers'], keys);
}

const envName = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The literal value of a Pi config value, undoing `escapePiConfigValue`, or why it is not a literal. Follows Pi's
 * template parser: a leading `!` runs a command, `$NAME` and `${NAME}` read the environment, and `$$` and `$!` are
 * a literal `$` and `!`; any other `$` is itself.
 */
export function unescapePiConfigValue(value: string): { literal: string } | { reason: string } {
  if (value.startsWith('!')) return { reason: 'API Key 来自命令' };
  const fromEnv = { reason: 'API Key 来自环境变量' };
  let literal = '';
  let index = 0;
  while (index < value.length) {
    const dollar = value.indexOf('$', index);
    if (dollar < 0) {
      literal += value.slice(index);
      break;
    }
    literal += value.slice(index, dollar);
    const next = value[dollar + 1];
    if (next === '$' || next === '!') {
      literal += next;
      index = dollar + 2;
    } else if (next === '{' && value.indexOf('}', dollar + 2) >= 0) {
      const end = value.indexOf('}', dollar + 2);
      if (envName.test(value.slice(dollar + 2, end))) return fromEnv;
      literal += value.slice(dollar, end + 1);
      index = end + 1;
    } else if (next !== undefined && /[A-Za-z_]/.test(next)) {
      return fromEnv;
    } else {
      literal += '$';
      index = dollar + 1;
    }
  }
  return { literal };
}

/** A Pi provider entry as an ohmyswitch provider; see 「导入」 in the contract. */
function importPiEntry(entry: unknown): HarnessImport {
  if (!isJsonObject(entry)) return notImportable('格式不正确');
  const name = typeof entry.name === 'string' ? entry.name : undefined;
  const endpoint = endpointBy(apis, 'api', entry.api);
  if (!endpoint) return notImportable(entry.api === undefined ? '没有指定 api' : `不支持 ${String(entry.api)}`, name);
  const root = importedBaseUrl(entry.baseUrl, apis[endpoint].path);
  if ('reason' in root) return notImportable(root.reason, name);
  if (typeof entry.apiKey !== 'string' || !entry.apiKey.trim())
    return notImportable('API Key 不在 models.json 中', name);
  const apiKey = unescapePiConfigValue(entry.apiKey);
  if ('reason' in apiKey) return notImportable(apiKey.reason, name);
  const models = (Array.isArray(entry.models) ? entry.models : []).filter(isJsonObject).map((model) => ({
    id: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    maxOutput: model.maxTokens,
    reasoning: model.reasoning,
    input: model.input,
    interleavedField:
      isJsonObject(model.compat) && model.compat.requiresReasoningContentOnAssistantMessages === true
        ? 'reasoning_content'
        : undefined,
  }));
  return {
    importable: true,
    ...(name ? { name } : {}),
    baseUrl: root.baseUrl,
    endpoint,
    apiKey: apiKey.literal.trim(),
    models: importedModels(models),
  };
}

export const piAdapter: HarnessAdapter = {
  readProviders: readPiProviders,
  entry: piProviderEntry,
  write: writePiProvider,
  reorder: reorderPiProviders,
  importEntry: importPiEntry,
  reservedKeys: builtinProviders,
  // The file holds API keys.
  newFileMode: 0o600,
};
