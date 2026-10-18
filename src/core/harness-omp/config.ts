import { type Document, isMap, isScalar, parseDocument, visit, type YAMLMap } from 'yaml';

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
import { isJsonObject, type JsonObject, withOwnedFields } from '#core/jsonc.ts';
import type { ModelInfo, StoredProvider } from '#core/provider.ts';
import { reorderYamlMap } from '#core/yaml.ts';

/**
 * omp's `models.yml`. The contract — which fields ohmyswitch owns and how they are derived — is documented in
 * `docs/harness/omp.md`; keep the two in sync.
 */

/**
 * Provider ids omp 18.12.1 knows: every catalog provider (`KnownProvider`), the bundled ones, and the local providers
 * it registers itself. A models.yml entry with one of these keys overrides the built-in provider.
 */
const builtinProviders = new Set([
  'abliteration',
  'aiand',
  'aimlapi',
  'alibaba-coding-plan',
  'alibaba-token-plan',
  'amazon-bedrock',
  'anthropic',
  'apple',
  'azure',
  'baseten',
  'bedrock-mantle',
  'cerebras',
  'charm-hyper',
  'cline-pass',
  'cloudflare-ai-gateway',
  'cloudflare-workers-ai',
  'commandcode',
  'coralbricks',
  'coreweave',
  'cursor',
  'deepinfra',
  'deepseek',
  'devin',
  'factory-droid',
  'firepass',
  'fireworks',
  'github-copilot',
  'gitlab-duo',
  'gitlab-duo-agent',
  'gmi-cloud',
  'google',
  'google-antigravity',
  'google-gemini-cli',
  'google-vertex',
  'groq',
  'helmcode',
  'huggingface',
  'kilo',
  'kimi-code',
  'litellm',
  'llama.cpp',
  'lm-studio',
  'local',
  'meta',
  'minimax',
  'minimax-cn',
  'minimax-code',
  'minimax-code-cn',
  'mistral',
  'moonshot',
  'muse-code',
  'nanogpt',
  'novita',
  'nvidia',
  'ollama',
  'ollama-cloud',
  'openai',
  'openai-codex',
  'opencode-go',
  'opencode-zen',
  'openrouter',
  'qianfan',
  'qwen-portal',
  'sakana',
  'sambanova',
  'siliconflow',
  'siliconflow-cn',
  'singularityapi-dev',
  'singularityapi-tech',
  'snowflake',
  'stepfun',
  'synthetic',
  'together',
  'typesafe',
  'umans',
  'venice',
  'vercel-ai-gateway',
  'vllm',
  'wafer-serverless',
  'web',
  'xai',
  'xai-oauth',
  'xiaomi',
  'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'yolo-auto',
  'zai',
  'zenmux',
  'zhipu-coding-plan',
]);

type OmpApi = 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-generative-ai';

/** omp's API for each endpoint, and the path its client expects at the end of `baseUrl`. */
const apis = {
  '/v1/chat/completions': { api: 'openai-completions', path: '/v1' },
  '/v1/responses': { api: 'openai-responses', path: '/v1' },
  '/v1/messages': { api: 'anthropic-messages', path: '' },
  '/v1beta/generateContent': { api: 'google-generative-ai', path: '/v1beta' },
} as const satisfies Record<Endpoint, { api: OmpApi; path: string }>;

/** The assistant fields omp can echo reasoning back in (`compat.reasoningContentField`). */
const reasoningFields = new Set(['reasoning_content', 'reasoning', 'reasoning_text']);

/** A value omp would read as an environment variable name before using it literally. */
const envName = /^[A-Za-z_][A-Za-z0-9_]*$/;

// --- YAML -------------------------------------------------------------------------------------------------------

/** Long values stay on one line instead of being folded. */
const stringifyOptions = { lineWidth: 0 };

const fileError = (message: string) => new AppError('precondition_failed', `omp 的 models.yml ${message}`);

const isEmpty = (node: unknown) => node === undefined || node === null || (isScalar(node) && node.value === null);

function parseModels(text: string | undefined): Document {
  const document: Document = parseDocument(text ?? '', { uniqueKeys: true });
  if (document.errors.length) throw fileError('不是有效的 YAML，请先修复');
  if (!isEmpty(document.contents) && !isMap(document.contents)) throw fileError('的顶层不是对象，请先修复');
  return document;
}

/** The `providers` map, or undefined when there is none yet. */
function providersMap(document: Document) {
  const root = document.contents;
  if (!isMap(root)) return undefined;
  const providers: unknown = root.get('providers', true);
  if (isEmpty(providers)) return undefined;
  if (!isMap(providers)) throw fileError('中的 providers 不是对象，请先修复');
  return providers;
}

/** Plain data as a node in block style, so written entries read like hand-written ones. */
function blockNode(document: Document, value: unknown) {
  const node = document.createNode(value);
  visit(node, {
    Map(_, map) {
      map.flow = false;
    },
    Seq(_, seq) {
      seq.flow = false;
    },
  });
  return node;
}

function readOmpProviders(text: string | undefined): Record<string, unknown> {
  const document = parseModels(text);
  const providers = providersMap(document);
  if (!providers) return {};
  const data: unknown = providers.toJS(document);
  return isJsonObject(data) ? data : {};
}

function writeOmpProvider(text: string | undefined, key: string, entry: unknown) {
  const document = parseModels(text);
  let providers = providersMap(document);
  if (!providers) {
    if (entry === undefined) return text ?? '';
    if (!isMap(document.contents)) document.contents = blockNode(document, {}) as YAMLMap;
    providers = blockNode(document, {}) as YAMLMap;
    (document.contents as YAMLMap).set('providers', providers);
  }
  providers.flow = false;
  if (entry === undefined) {
    // A comment above the map's first entry belongs to that entry, but the parser attaches it to the map.
    const first = providers.items[0];
    if (first && isScalar(first.key) && first.key.value === key) providers.commentBefore = null;
    providers.delete(key);
    providers.flow = providers.items.length === 0;
  } else {
    providers.set(key, blockNode(document, entry));
  }
  return document.toString(stringifyOptions);
}

function reorderOmpProviders(text: string | undefined, keys: readonly string[]) {
  if (!text?.trim()) return text;
  const document = parseModels(text);
  const providers = providersMap(document);
  if (!providers || !reorderYamlMap(providers, keys)) return text;
  return document.toString(stringifyOptions);
}

// --- Provider entry ---------------------------------------------------------------------------------------------

const ownedModelFields = ['id', 'name', 'reasoning', 'input', 'contextWindow', 'maxTokens', 'supportsTools'];
const ownedCompatFields = ['reasoningContentField', 'requiresReasoningContentForToolCalls'];

function ompModel(model: ModelInfo, api: OmpApi, existing: unknown): JsonObject {
  const input = model.input?.filter((kind) => kind === 'text' || kind === 'image');
  const field = typeof model.interleaved === 'object' ? model.interleaved.field : undefined;
  const echoes = api === 'openai-completions' && model.reasoning && field && reasoningFields.has(field);
  const target = withOwnedFields(existing, ownedModelFields, {
    id: model.id,
    name: model.name || undefined,
    reasoning: model.reasoning,
    input: input?.length ? input : undefined,
    contextWindow: model.contextWindow,
    maxTokens: model.maxOutput,
    supportsTools: model.toolCall,
  });
  const compat = withOwnedFields(target.compat, ownedCompatFields, {
    reasoningContentField: echoes ? field : undefined,
    requiresReasoningContentForToolCalls: echoes ? true : undefined,
  });
  if (Object.keys(compat).length) target.compat = compat;
  else delete target.compat;
  return target;
}

function ompProviderEntry(provider: StoredProvider, existing: unknown): JsonObject {
  // omp runs a value starting with `!` as a command, and there is no way to escape it.
  if (provider.apiKey.startsWith('!')) {
    throw new AppError('precondition_failed', 'omp 会把以 ! 开头的 API Key 当作命令执行，无法写入');
  }
  const { api, path } = apis[provider.endpoint];
  const previous = isJsonObject(existing) ? existing : {};
  const previousModels = new Map(
    (Array.isArray(previous.models) ? previous.models : [])
      .filter(isJsonObject)
      .map((model) => [model.id, model] as const),
  );
  return withOwnedFields(previous, ['baseUrl', 'api', 'apiKey', 'auth', 'models'], {
    baseUrl: `${provider.baseUrl}${path}`,
    api,
    apiKey: provider.apiKey,
    // Without it, custom Anthropic Messages providers are sent Claude Code's OAuth-style requests.
    auth: 'apiKey',
    models: provider.models.map((model) => ompModel(model, api, previousModels.get(model.id))),
  });
}

/** An omp provider entry as an ohmyswitch provider; see 「导入」 in the contract. */
function importOmpEntry(entry: unknown): HarnessImport {
  if (!isJsonObject(entry)) return notImportable('格式不正确');
  const endpoint = endpointBy(apis, 'api', entry.api);
  if (!endpoint) return notImportable(entry.api === undefined ? '没有指定 api' : `不支持 ${String(entry.api)}`);
  if (entry.transport !== undefined) return notImportable('通过 auth-gateway 转发');
  if (entry.auth === 'oauth' || entry.auth === 'none') return notImportable(`auth 为 ${entry.auth}`);
  const root = importedBaseUrl(entry.baseUrl, apis[endpoint].path);
  if ('reason' in root) return notImportable(root.reason);
  const apiKey = entry.apiKey;
  if (typeof apiKey !== 'string' || !apiKey.trim()) return notImportable('API Key 不在 models.yml 中');
  if (apiKey.startsWith('!')) return notImportable('API Key 来自命令');
  if (envName.test(apiKey) && apiKey === apiKey.toUpperCase()) return notImportable('API Key 来自环境变量');
  const models = (Array.isArray(entry.models) ? entry.models : []).filter(isJsonObject).map((model) => {
    const compat = isJsonObject(model.compat) ? model.compat : {};
    return {
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      maxOutput: model.maxTokens,
      reasoning: model.reasoning,
      input: model.input,
      toolCall: model.supportsTools,
      interleavedField: compat.reasoningContentField,
    };
  });
  return {
    importable: true,
    baseUrl: root.baseUrl,
    endpoint,
    apiKey: apiKey.trim(),
    models: importedModels(models),
  };
}

export const ompAdapter: HarnessAdapter = {
  readProviders: readOmpProviders,
  entry: ompProviderEntry,
  write: writeOmpProvider,
  reorder: reorderOmpProviders,
  importEntry: importOmpEntry,
  reservedKeys: builtinProviders,
  // The file holds API keys.
  newFileMode: 0o600,
};
