import {
  type Document,
  isMap,
  isScalar,
  isSeq,
  type Node,
  parseDocument,
  Scalar,
  visit,
  type YAMLMap,
  YAMLSeq,
} from 'yaml';

import type { Endpoint } from '../endpoints.ts';
import { AppError } from '../errors.ts';
import { isJsonObject, type JsonObject, withOwnedFields } from '../jsonc.ts';
import type { ModelInfo, StoredProvider } from '../provider.ts';
import type { HarnessAdapter } from './adapter.ts';

/**
 * DeepSeek Harness: providers in the `llm-pi-ai` entry of each profile's `cordis.patch.yml`, API keys in
 * `.credentials.yaml`. The contract — which fields ohmyswitch owns and how they are derived — is documented in
 * `docs/harness/dsh.md`; keep the two in sync.
 */

/** Ids in the pi-ai 0.87.1 catalog DSH 0.2.0-rc.2 ships; a route with one of these keys inherits the catalog. */
const catalogProviders = [
  'amazon-bedrock',
  'ant-ling',
  'anthropic',
  'azure-openai-responses',
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
  'vercel-ai-gateway',
  'xai',
  'xiaomi',
  'xiaomi-token-plan-ams',
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'zai',
  'zai-coding-cn',
];

/** Routes registered by DSH's own DeepSeek adapters. */
const deepseekRoutes = ['deepseek-official', 'deepseek-account'];

type DshApi = 'openai-completions' | 'openai-responses' | 'anthropic-messages';

/** DSH's API for each endpoint it can serve, and the path its client expects at the end of `baseURL`. */
const apis: Partial<Record<Endpoint, { api: DshApi; path: string }>> = {
  '/v1/chat/completions': { api: 'openai-completions', path: '/v1' },
  '/v1/responses': { api: 'openai-responses', path: '/v1' },
  '/v1/messages': { api: 'anthropic-messages', path: '' },
};

export const dshUnsupportedEndpoints: readonly Endpoint[] = ['/v1beta/generateContent'];

// --- YAML -------------------------------------------------------------------------------------------------------

const jsTag = 'tag:yaml.org,2002:js';

/** `!!js` expressions are kept as tagged strings, so untouched ones are written back as they were. */
const patchOptions = { customTags: [{ tag: jsTag, resolve: (value: string) => value }], uniqueKeys: true };

/** Long values stay on one line instead of being folded. */
const stringifyOptions = { lineWidth: 0 };

/** A node as plain data. `!!js` expressions become `{ __jsExpr }` objects, so comparing and rewriting keeps them. */
function toData(node: Node, document: Document) {
  const copy = node.clone() as Node;
  visit(copy, {
    Scalar(_, scalar) {
      if (scalar.tag === jsTag) return document.createNode({ __jsExpr: String(scalar.value) });
    },
  });
  return copy.toJS(document) as unknown;
}

/** Plain data as a node, turning `{ __jsExpr }` objects back into `!!js` expressions. Collections are block style. */
function toNode(document: Document, value: unknown) {
  const node = document.createNode(value);
  visit(node, {
    Map(_, map) {
      map.flow = false;
      if (map.items.length !== 1 || typeof map.get('__jsExpr') !== 'string') return;
      const expression = new Scalar(map.get('__jsExpr'));
      expression.tag = jsTag;
      return expression;
    },
    Seq(_, seq) {
      seq.flow = false;
    },
  });
  return node;
}

// --- Profile patch ----------------------------------------------------------------------------------------------

const entryId = 'llm-pi-ai';
const entryName = '@deepseek-ai/dsh-llm-pi-ai';

/** DSH's template for a new profile patch; an empty or comment-only patch fails DSH's startup. */
const newPatch = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`;

const patchError = (message: string) => new AppError('precondition_failed', message);

function parsePatch(text: string | undefined, label: string): Document {
  const document: Document = parseDocument(text?.trim() ? text : newPatch, patchOptions);
  if (document.errors.length) throw patchError(`${label} 不是有效的 YAML，请先修复`);
  if (document.contents !== null && !isSeq(document.contents)) {
    throw patchError(`${label} 的顶层不是数组，请先修复`);
  }
  return document;
}

/** The row DSH applies to `llm-pi-ai`: like DSH's config editor, the last one targeting it by id. */
function entryRow(document: Document) {
  const rows = isSeq(document.contents) ? document.contents.items : [];
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    if (!isMap(row) || row.get('id') !== entryId || row.has('insert')) continue;
    if (row.has('name') && row.get('name') !== entryName) continue;
    return row;
  }
  return undefined;
}

const isEmpty = (node: unknown) => node === undefined || node === null || (isScalar(node) && node.value === null);

/** The `providers` map of the `llm-pi-ai` row, or undefined when there is none yet. */
function providersMap(row: YAMLMap | undefined, label: string) {
  if (!row) return undefined;
  const config: unknown = row.get('config', true);
  if (isEmpty(config)) return undefined;
  if (!isMap(config)) throw patchError(`${label} 中 llm-pi-ai 的 config 不是普通的对象，ohmyswitch 无法修改`);
  const providers: unknown = config.get('providers', true);
  if (isEmpty(providers)) return undefined;
  if (!isMap(providers)) throw patchError(`${label} 中 llm-pi-ai 的 providers 不是普通的对象，ohmyswitch 无法修改`);
  return providers;
}

function readPatchProviders(text: string | undefined): Record<string, unknown> {
  const label = 'DeepSeek Harness 的 profile patch';
  const document = parsePatch(text, label);
  const providers = providersMap(entryRow(document), label);
  if (!providers) return {};
  const data = toData(providers, document);
  return isJsonObject(data) ? data : {};
}

function writePatchProvider(text: string | undefined, key: string, entry: unknown) {
  const label = 'DeepSeek Harness 的 profile patch';
  const document = parsePatch(text, label);
  let row = entryRow(document);
  if (!row && entry === undefined) return text ?? '';
  const rows = isSeq(document.contents) ? document.contents : new YAMLSeq();
  document.contents = rows;
  rows.flow = false;
  if (!row) {
    row = toNode(document, { id: entryId, name: entryName, config: { providers: {} } }) as YAMLMap;
    rows.add(row);
  }
  if (isEmpty(row.get('config', true))) row.set('config', toNode(document, {}));
  const config = row.get('config', true) as unknown as YAMLMap;
  const providers = providersMap(row, label) ?? (toNode(document, {}) as YAMLMap);
  if (!config.has('providers') || isEmpty(config.get('providers', true))) config.set('providers', providers);
  config.flow = false;
  providers.flow = false;
  if (entry === undefined) {
    providers.delete(key);
    // The row itself is shared with DSH's own UI, so it stays even when ohmyswitch's entries were all it held.
    providers.flow = providers.items.length === 0;
  } else {
    providers.set(key, toNode(document, entry));
  }
  return document.toString(stringifyOptions);
}

/** Whether a patch (the home-level one) sets `llm-pi-ai`'s config, which would override every profile. */
export function patchSetsProviders(text: string | undefined) {
  if (!text?.trim()) return false;
  const row = entryRow(parsePatch(text, 'DeepSeek Harness 的 home patch'));
  return Boolean(row && !isEmpty(row.get('config', true)));
}

// --- Provider entry ---------------------------------------------------------------------------------------------

/** The credential reference holding a provider's API key: `OHMYSWITCH_<KEY>_API_KEY`. */
export const credentialRef = (key: string) => `OHMYSWITCH_${key.toUpperCase().replaceAll('-', '_')}_API_KEY`;

const graded = ['minimal', 'low', 'medium', 'high'] as const;
const levels = [...graded, 'xhigh', 'max'] as const;

/**
 * DSH's `reasoningEfforts` for a model, or undefined when it does not reason. Unlike Pi's `thinkingLevelMap`,
 * levels not listed are not offered, and only `off` may have no value ("send nothing"). See the contract.
 */
export function dshReasoningEfforts(model: ModelInfo): Record<string, string | null> | undefined {
  if (model.reasoning !== true) return undefined;
  const options = model.reasoningOptions;
  const fixed = { high: 'high' };
  if (!options || (options.length && options.every((option) => option.type === 'budget_tokens'))) {
    return { off: null, ...Object.fromEntries(graded.map((level) => [level, level])) };
  }
  const efforts = options.find((option) => option.type === 'effort')?.values;
  const hasToggle = options.some((option) => option.type === 'toggle');
  if (efforts) {
    const offered = levels.filter((level) => efforts.includes(level));
    if (!offered.length) return fixed;
    const off: Record<string, string | null> = efforts.includes('none')
      ? { off: 'none' }
      : hasToggle
        ? { off: null }
        : {};
    return { ...off, ...Object.fromEntries(offered.map((level) => [level, level])) };
  }
  if (hasToggle) return { off: null, ...fixed };
  return fixed;
}

const ownedModelFields = ['id', 'name', 'contextWindow', 'maxTokens', 'input', 'reasoningEfforts'];
const ownedCompatFields = ['forceAdaptiveThinking', 'requiresReasoningContentOnAssistantMessages'];

function dshModel(model: ModelInfo, api: DshApi, existing: unknown): JsonObject {
  const efforts = model.reasoningOptions?.some((option) => option.type === 'effort');
  const interleavedField = typeof model.interleaved === 'object' ? model.interleaved.field : undefined;
  const input = model.input?.filter((kind) => kind === 'text' || kind === 'image');
  const target = withOwnedFields(existing, ownedModelFields, {
    id: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    maxTokens: model.maxOutput,
    input: input?.length ? input : undefined,
    reasoningEfforts: dshReasoningEfforts(model),
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

function dshProviderEntry(provider: StoredProvider, existing: unknown, key: string): JsonObject {
  const protocol = apis[provider.endpoint];
  if (!protocol) throw new AppError('precondition_failed', 'DeepSeek Harness 不支持 Google Generative AI 端点');
  // DSH rejects a hand-declared route without models, and with it every other change in the same patch.
  if (!provider.models.length) throw new AppError('precondition_failed', 'DeepSeek Harness 要求供应商至少有一个模型');
  const previous = isJsonObject(existing) ? existing : {};
  const previousModels = new Map(
    (Array.isArray(previous.models) ? previous.models : [])
      .filter(isJsonObject)
      .map((model) => [model.id, model] as const),
  );
  return withOwnedFields(previous, ['displayName', 'api', 'baseURL', 'apiKeyEnv', 'models'], {
    displayName: provider.name,
    api: protocol.api,
    baseURL: `${provider.baseUrl}${protocol.path}`,
    apiKeyEnv: credentialRef(key),
    models: provider.models.map((model) => dshModel(model, protocol.api, previousModels.get(model.id))),
  });
}

export const dshPatchAdapter: HarnessAdapter = {
  readProviders: readPatchProviders,
  entry: dshProviderEntry,
  write: writePatchProvider,
  reservedKeys: new Set([...catalogProviders, ...deepseekRoutes]),
  // DSH writes profile patches with 0600.
  newFileMode: 0o600,
};

// --- Credentials ------------------------------------------------------------------------------------------------

const refPattern = /^OHMYSWITCH_([A-Z0-9_]+)_API_KEY$/;
const credentialsError = (message: string) =>
  new AppError('precondition_failed', `DeepSeek Harness 的凭据文件${message}`);

/** `.credentials.yaml`: `version: 1`, `refs` and `records` only. An empty document is an empty store. */
function parseCredentials(text: string | undefined): Document {
  const document: Document = parseDocument(text ?? '', { uniqueKeys: true });
  if (document.errors.length) throw credentialsError('不是有效的 YAML，请先修复');
  const root = document.contents;
  if (root === null || (isScalar(root) && root.value === null)) return document;
  if (!isMap(root)) throw credentialsError('格式不正确，请先修复');
  const keys = root.items.map((pair) => (isScalar(pair.key) ? pair.key.value : undefined));
  if (keys.some((key) => key !== 'version' && key !== 'refs' && key !== 'records')) {
    throw credentialsError('格式不正确或是旧格式，请先启动一次 DeepSeek Harness');
  }
  if (keys.length && (root.get('version') as unknown) !== 1) throw credentialsError('版本不受支持');
  const refs: unknown = root.get('refs', true);
  if (!isEmpty(refs) && !isMap(refs)) throw credentialsError('中的 refs 格式不正确，请先修复');
  return document;
}

function readCredentialProviders(text: string | undefined): Record<string, unknown> {
  const document = parseCredentials(text);
  const refs: unknown = isMap(document.contents) ? document.contents.get('refs', true) : undefined;
  if (!isMap(refs)) return {};
  const entries: Record<string, unknown> = {};
  for (const pair of refs.items) {
    const match = isScalar(pair.key) ? refPattern.exec(String(pair.key.value)) : null;
    if (match) entries[match[1].toLowerCase().replaceAll('_', '-')] = isScalar(pair.value) ? pair.value.value : null;
  }
  return entries;
}

function writeCredential(text: string | undefined, key: string, entry: unknown) {
  const document = parseCredentials(text);
  if (!isMap(document.contents)) document.contents = toNode(document, { version: 1 }) as YAMLMap;
  const root = document.contents as YAMLMap;
  if (!root.has('version')) root.items.unshift(document.createPair('version', 1));
  if (!isMap(root.get('refs', true))) root.set('refs', toNode(document, {}));
  const refsMap = root.get('refs', true) as unknown as YAMLMap;
  refsMap.flow = false;
  const ref = credentialRef(key);
  if (entry === undefined) {
    // A comment above a section's first entry belongs to that entry, but the parser attaches it to the section.
    const first = refsMap.items[0];
    if (first && isScalar(first.key) && first.key.value === ref) refsMap.commentBefore = null;
    refsMap.delete(ref);
  } else {
    refsMap.set(ref, entry);
  }
  return document.toString(stringifyOptions);
}

export const dshCredentialsAdapter: HarnessAdapter = {
  readProviders: readCredentialProviders,
  entry: (provider) => provider.apiKey,
  write: writeCredential,
  reservedKeys: new Set(),
  // DSH refuses to load a credentials file other users can read.
  newFileMode: 0o600,
};
