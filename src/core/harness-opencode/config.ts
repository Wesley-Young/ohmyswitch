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
import { type OpenCodeProtocol, openCodeVariants } from './variants.ts';

/**
 * OpenCode V2's global `opencode.json(c)`, `providers` section only. The contract is documented in
 * `docs/harness/opencode.md`; keep the two in sync.
 */

/** Provider ids registered by OpenCode v2.0.27 plugins. Catalog providers are reserved separately. */
const pluginProviders = new Set([
  'amazon-bedrock',
  'azure',
  'cerebras',
  'chatgpt',
  'cloudflare-ai-gateway',
  'cloudflare-workers-ai',
  'cohere',
  'databricks',
  'digitalocean',
  'github-copilot',
  'gitlab',
  'google-vertex',
  'kilo',
  'llmgateway',
  'lmstudio',
  'modal',
  'neon',
  'nvidia',
  'ollama',
  'openai',
  'opencode',
  'openrouter',
  'perplexity',
  'poe',
  'sap-ai-core',
  'snowflake-cortex',
  'vercel',
  'vllm',
  'xai',
  'zenmux',
]);

/** OpenCode's package for each endpoint, and the path its protocol expects at the end of `baseURL`. */
const packages = {
  '/v1/chat/completions': { package: '@opencode/ai/providers/openai-compatible', path: '/v1', protocol: 'chat' },
  '/v1/responses': {
    package: '@opencode/ai/providers/openai-compatible/responses',
    path: '/v1',
    protocol: 'responses',
  },
  '/v1/messages': { package: '@opencode/ai/providers/anthropic-compatible', path: '/v1', protocol: 'anthropic' },
  '/v1beta/generateContent': { package: '@opencode/ai/providers/google', path: '/v1beta', protocol: 'google' },
} as const satisfies Record<Endpoint, { package: string; path: string; protocol: OpenCodeProtocol }>;

const newFile = '{\n  "providers": {}\n}\n';

/** OpenCode substitutes these in the raw text before parsing, with no way to escape them. */
const substitution = /\{(env|file):/;

function rejectSubstitution(value: string, label: string) {
  if (substitution.test(value)) {
    throw new AppError('bad_request', `OpenCode 会替换 {env:…} 和 {file:…}，${label}中不能包含它们`);
  }
}

function openCodeModel(model: ModelInfo, protocol: OpenCodeProtocol, existing: unknown): JsonObject {
  rejectSubstitution(model.id, '模型 id ');
  rejectSubstitution(model.name ?? '', '模型名称');
  const previous = isJsonObject(existing) ? existing : {};
  const capabilities = withOwnedFields(previous.capabilities, ['tools', 'input'], {
    tools: model.toolCall,
    input: model.input?.length ? model.input : undefined,
  });
  const limit = withOwnedFields(previous.limit, ['context', 'output'], {
    context: model.contextWindow,
    output: model.maxOutput,
  });
  const compatibility = withOwnedFields(previous.compatibility, ['reasoningField'], {
    reasoningField: typeof model.interleaved === 'object' ? model.interleaved.field : undefined,
  });
  const nonEmpty = (value: JsonObject) => (Object.keys(value).length ? value : undefined);
  return withOwnedFields(previous, ['name', 'capabilities', 'limit', 'compatibility', 'variants'], {
    name: model.name,
    capabilities: nonEmpty(capabilities),
    limit: nonEmpty(limit),
    compatibility: nonEmpty(compatibility),
    variants: openCodeVariants(model, protocol),
  });
}

function openCodeProviderEntry(provider: StoredProvider, existing: unknown): JsonObject {
  const target = packages[provider.endpoint];
  rejectSubstitution(provider.name, '名称');
  rejectSubstitution(provider.baseUrl, 'Base URL ');
  rejectSubstitution(provider.apiKey, 'API Key ');
  const previous = isJsonObject(existing) ? existing : {};
  const previousModels = isJsonObject(previous.models) ? previous.models : {};
  return withOwnedFields(previous, ['name', 'package', 'settings', 'models'], {
    name: provider.name,
    package: target.package,
    settings: withOwnedFields(previous.settings, ['baseURL', 'apiKey'], {
      baseURL: `${provider.baseUrl}${target.path}`,
      apiKey: provider.apiKey,
    }),
    models: Object.fromEntries(
      provider.models.map((model) => [model.id, openCodeModel(model, target.protocol, previousModels[model.id])]),
    ),
  });
}

function parseConfig(text: string | undefined): JsonObject {
  if (text === undefined || !text.trim()) return {};
  const config = parseJsonc(text);
  if (config === undefined) throw new AppError('precondition_failed', 'OpenCode 的配置文件不是有效的 JSON，请先修复');
  if (!isJsonObject(config) || (config.providers !== undefined && !isJsonObject(config.providers))) {
    throw new AppError('precondition_failed', 'OpenCode 的配置文件格式不正确，请先修复');
  }
  return config;
}

function writeOpenCodeProvider(text: string | undefined, key: string, entry: unknown) {
  let base = text === undefined || !text.trim() ? newFile : text;
  if (parseConfig(base).providers === undefined) {
    if (entry === undefined) return base;
    base = setJsoncValue(base, ['providers'], {});
  }
  return setJsoncValue(base, ['providers', key], entry);
}

function reorderOpenCodeProviders(text: string | undefined, keys: readonly string[]) {
  if (text === undefined || !text.trim()) return text;
  parseConfig(text);
  return reorderJsoncProperties(text, ['providers'], keys);
}

/** An OpenCode provider entry as an ohmyswitch provider; see 「导入」 in the contract. */
function importOpenCodeEntry(entry: unknown): HarnessImport {
  if (!isJsonObject(entry)) return notImportable('格式不正确');
  const name = typeof entry.name === 'string' ? entry.name : undefined;
  const endpoint = endpointBy(packages, 'package', entry.package);
  if (!endpoint) {
    return notImportable(entry.package === undefined ? '没有指定 package' : `不支持 ${String(entry.package)}`, name);
  }
  const settings = isJsonObject(entry.settings) ? entry.settings : {};
  const apiKey = settings.apiKey;
  if (typeof apiKey !== 'string' || !apiKey.trim()) return notImportable('API Key 不在配置文件中', name);
  if (apiKey.includes('{env:')) return notImportable('API Key 来自环境变量', name);
  if (apiKey.includes('{file:')) return notImportable('API Key 来自文件', name);
  const models = Object.entries(isJsonObject(entry.models) ? entry.models : {}).flatMap(([id, model]) => {
    if (!isJsonObject(model)) return [];
    const capabilities = isJsonObject(model.capabilities) ? model.capabilities : {};
    const limit = isJsonObject(model.limit) ? model.limit : {};
    const compatibility = isJsonObject(model.compatibility) ? model.compatibility : {};
    return [
      {
        id,
        name: model.name,
        contextWindow: limit.context,
        maxOutput: limit.output,
        input: capabilities.input,
        toolCall: capabilities.tools,
        interleavedField: compatibility.reasoningField,
      },
    ];
  });
  // OpenCode substitutes these in the raw text, so ohmyswitch could not write the values back as they are.
  const written = [name, settings.baseURL, ...models.flatMap((model) => [model.id, model.name])];
  if (written.some((value) => typeof value === 'string' && substitution.test(value))) {
    return notImportable('配置中使用了 {env:…} 或 {file:…}', name);
  }
  const root = importedBaseUrl(settings.baseURL, packages[endpoint].path);
  if ('reason' in root) return notImportable(root.reason, name);
  return {
    importable: true,
    ...(name ? { name } : {}),
    baseUrl: root.baseUrl,
    endpoint,
    apiKey: apiKey.trim(),
    models: importedModels(models),
  };
}

export const openCodeAdapter: HarnessAdapter = {
  readProviders: (text) => (parseConfig(text).providers as JsonObject | undefined) ?? {},
  entry: openCodeProviderEntry,
  write: writeOpenCodeProvider,
  reorder: reorderOpenCodeProviders,
  importEntry: importOpenCodeEntry,
  reservedKeys: pluginProviders,
  reservesCatalogProviders: true,
  // V1 `provider` entries with the same key conflict with ours; OpenCode would let the V2 entry win.
  occupiedKeys: (text) => {
    const legacy = parseConfig(text).provider;
    return isJsonObject(legacy) ? Object.keys(legacy) : [];
  },
  // The file holds API keys.
  newFileMode: 0o600,
};
