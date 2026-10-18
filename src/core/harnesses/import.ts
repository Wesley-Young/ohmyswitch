import { type Endpoint, endpoints } from '#core/endpoints.ts';
import { baseUrl, type ModelInfo, modelInfo, modelInputs } from '#core/provider.ts';
import type { HarnessId } from './types.ts';

/** A provider entry found in a harness config, not owned by ohmyswitch, and what importing it would give. */
export interface ImportSource {
  harnessId: HarnessId;
  key: string;
  entry: HarnessImport;
}

/**
 * A harness config entry read back as a provider, so it can be imported into ohmyswitch. An entry ohmyswitch
 * cannot take over as it is — its API key is not in the file, or its protocol or address cannot be expressed — is
 * not importable, with a user-facing reason.
 */
export type HarnessImport =
  | {
      importable: true;
      name?: string;
      /** ohmyswitch's Base URL: the root the endpoint is appended to. */
      baseUrl: string;
      endpoint: Endpoint;
      apiKey: string;
      models: ModelInfo[];
    }
  | { importable: false; name?: string; reason: string };

export const notImportable = (reason: string, name?: string): HarnessImport => ({
  importable: false,
  reason,
  ...(name ? { name } : {}),
});

/**
 * ohmyswitch's Base URL for an address a harness was configured with, given the version path the harness's client
 * expects at its end for the endpoint (such as `/v1`). An address ohmyswitch would write back differently is
 * refused, so taking the entry over does not change where requests go.
 */
export function importedBaseUrl(configured: unknown, path: string): { baseUrl: string } | { reason: string } {
  if (typeof configured !== 'string' || !configured.trim()) return { reason: '没有 Base URL' };
  const trimmed = configured.trim().replace(/\/+$/, '');
  const root = baseUrl.safeParse(trimmed);
  if (!root.success) return { reason: 'Base URL 无效' };
  if (`${root.data}${path}` !== trimmed)
    return { reason: path ? `Base URL 不以 ${path} 结尾` : 'Base URL 不应以版本路径结尾' };
  return { baseUrl: root.data };
}

/** The endpoint whose entry in `table` has `value` in `field`, such as Pi's `api` or OpenCode's `package`. */
export function endpointBy<K extends string>(
  table: Partial<Record<Endpoint, Readonly<Record<K, unknown>>>>,
  field: K,
  value: unknown,
) {
  return endpoints.find((endpoint) => table[endpoint] !== undefined && table[endpoint][field] === value);
}

/** A model's fields as read from a harness config, before they are checked. */
export interface RawModel {
  id: unknown;
  name?: unknown;
  contextWindow?: unknown;
  maxOutput?: unknown;
  reasoning?: unknown;
  input?: unknown;
  toolCall?: unknown;
  interleavedField?: unknown;
}

/**
 * A model read from a harness config, keeping each field only when it is valid; unknown stays unset, as
 * everywhere in ohmyswitch. Undefined when the id itself is not usable.
 */
export function importedModel(raw: RawModel): ModelInfo | undefined {
  const fields = modelInfo.shape;
  const id = fields.id.safeParse(raw.id);
  if (!id.success) return undefined;
  const model: ModelInfo = { id: id.data };
  const name = fields.name.safeParse(raw.name);
  if (name.success && name.data && name.data !== id.data) model.name = name.data;
  const contextWindow = fields.contextWindow.safeParse(raw.contextWindow);
  if (contextWindow.success && contextWindow.data) model.contextWindow = contextWindow.data;
  const maxOutput = fields.maxOutput.safeParse(raw.maxOutput);
  if (maxOutput.success && maxOutput.data) model.maxOutput = maxOutput.data;
  if (typeof raw.reasoning === 'boolean') model.reasoning = raw.reasoning;
  if (typeof raw.toolCall === 'boolean') model.toolCall = raw.toolCall;
  if (Array.isArray(raw.input)) {
    const input = modelInputs.filter((kind) => (raw.input as unknown[]).includes(kind));
    if (input.length) model.input = input;
  }
  const interleaved = fields.interleaved.safeParse(
    typeof raw.interleavedField === 'string' ? { field: raw.interleavedField } : undefined,
  );
  if (interleaved.success && interleaved.data) model.interleaved = interleaved.data;
  return model;
}

/** Models in config order, dropping invalid ones and repeated ids. */
export function importedModels(raws: readonly RawModel[]): ModelInfo[] {
  const models = new Map<string, ModelInfo>();
  for (const raw of raws) {
    const model = importedModel(raw);
    if (model && !models.has(model.id)) models.set(model.id, model);
  }
  return [...models.values()];
}
