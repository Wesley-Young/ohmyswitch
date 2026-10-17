import { z } from 'zod';

import {
  interleaved,
  type ModelInfo,
  modelInputs,
  type ReasoningOption,
  reasoningEffort,
  reasoningOption,
} from './provider.ts';

/** Where models.dev publishes its catalog. */
export const modelsDevUrl = 'https://models.dev/api.json';

/** One models.dev entry reduced to the metadata ohmyswitch keeps. */
export const catalogEntry = z.object({
  providerId: z.string(),
  id: z.string(),
  /** Whether the entry comes from the model's own publisher rather than a reseller. */
  official: z.boolean(),
  name: z.string().optional(),
  contextWindow: z.number().int().positive().optional(),
  maxOutput: z.number().int().positive().optional(),
  reasoning: z.boolean().optional(),
  reasoningOptions: z.array(reasoningOption).optional(),
  interleaved: interleaved.optional(),
  input: z.array(z.enum(modelInputs)).optional(),
  toolCall: z.boolean().optional(),
});

export type CatalogEntry = z.infer<typeof catalogEntry>;

/**
 * Publishers recognized by model id prefix, with the models.dev provider ids that count as first-party.
 * Entries with a `canonical_model_id` are recognized without this table; it covers the ones that omit it.
 */
const publishers: readonly [RegExp, readonly string[]][] = [
  [/^claude-/, ['anthropic']],
  [/^(gpt-|o[134](-|$)|chatgpt-|codex-)/, ['openai']],
  [/^(gemini-|gemma-)/, ['google', 'google-vertex']],
  [/^deepseek-/, ['deepseek']],
  [/^kimi-/, ['moonshotai', 'moonshotai-cn']],
  [/^glm-/, ['zhipuai', 'zhipuai-cn', 'zai']],
  [/^minimax-/, ['minimax', 'minimax-cn']],
  [/^(qwen|qwq-)/, ['alibaba', 'alibaba-cn']],
  [/^grok-/, ['xai']],
];

const lastSegment = (id: string) => id.toLowerCase().split('/').at(-1) ?? '';

function isOfficial(providerId: string, id: string, canonicalModelId: unknown) {
  const publisher = typeof canonicalModelId === 'string' ? canonicalModelId.split('/')[0] : undefined;
  if (publisher && publisher === providerId) return true;
  const known = publishers.find(([prefix]) => prefix.test(lastSegment(id)));
  return Boolean(known?.[1].includes(providerId));
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const positiveInt = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
const bool = (value: unknown) => (typeof value === 'boolean' ? value : undefined);

/**
 * Keep the options that parse; invalid effort values are dropped rather than discarding the option. An empty list
 * is kept: it means the model reasons but offers no control over it, which differs from unknown.
 */
function reasoningOptions(value: unknown): ReasoningOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.length) return [];
  const options = value.flatMap((item): ReasoningOption[] => {
    const option = record(item);
    const values = Array.isArray(option.values)
      ? [...new Set(option.values.filter((effort) => reasoningEffort.safeParse(effort).success))]
      : option.values;
    const parsed = reasoningOption.safeParse({ ...option, values });
    return parsed.success ? [parsed.data] : [];
  });
  return options.length ? options.slice(0, 8) : undefined;
}

/** Reduce the raw models.dev catalog. Malformed entries are skipped rather than failing the whole catalog. */
export function parseModelsDev(raw: unknown): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const [providerId, provider] of Object.entries(record(raw))) {
    for (const value of Object.values(record(record(provider).models))) {
      const model = record(value);
      if (typeof model.id !== 'string' || !model.id || model.id.length > 256) continue;
      const limit = record(model.limit);
      const inputs = record(model.modalities).input;
      const name = typeof model.name === 'string' && model.name && model.name !== model.id ? model.name : undefined;
      entries.push({
        providerId,
        id: model.id,
        official: isOfficial(providerId, model.id, model.canonical_model_id),
        ...(name ? { name: name.slice(0, 256) } : {}),
        contextWindow: positiveInt(limit.context),
        maxOutput: positiveInt(limit.output),
        reasoning: bool(model.reasoning),
        reasoningOptions: reasoningOptions(model.reasoning_options),
        interleaved: interleaved.safeParse(model.interleaved).data,
        input: Array.isArray(inputs) ? modelInputs.filter((input) => (inputs as unknown[]).includes(input)) : undefined,
        toolCall: bool(model.tool_call),
      });
    }
  }
  return entries;
}

/**
 * Finds catalog metadata for a model id, matched exactly or without a `vendor/` prefix. A first-party entry
 * wins over resellers; among resellers an exact match wins, then provider order. No fuzzy matching.
 */
export class ModelsDevIndex {
  private readonly exact = new Map<string, CatalogEntry[]>();
  private readonly bySegment = new Map<string, CatalogEntry[]>();
  /** Every provider id in the catalog. Harnesses that build on models.dev treat these as built-in providers. */
  readonly providerIds: ReadonlySet<string>;

  constructor(entries: readonly CatalogEntry[]) {
    this.providerIds = new Set(entries.map((entry) => entry.providerId));
    const sorted = [...entries].sort((a, b) => a.providerId.localeCompare(b.providerId));
    for (const entry of sorted) {
      push(this.exact, entry.id.toLowerCase(), entry);
      push(this.bySegment, lastSegment(entry.id), entry);
    }
  }

  find(id: string): CatalogEntry | undefined {
    const exact = this.exact.get(id.toLowerCase()) ?? [];
    const bySegment = this.bySegment.get(lastSegment(id)) ?? [];
    const official = (entry: CatalogEntry) => entry.official;
    return exact.find(official) ?? bySegment.find(official) ?? exact[0] ?? bySegment[0];
  }

  /** Fill only the fields a model is missing; values already present (from the provider or the user) win. */
  enrich(model: ModelInfo): ModelInfo {
    const entry = this.find(model.id);
    if (!entry) return model;
    const { id, ...known } = compact(model);
    return compact({ id, ...metadata(entry), ...known });
  }

  /** Replace every field models.dev knows with its value; fields it does not know are kept. */
  sync(model: ModelInfo): { model: ModelInfo; matched: boolean } {
    const entry = this.find(model.id);
    if (!entry) return { model, matched: false };
    return { model: compact({ ...compact(model), ...metadata(entry) }), matched: true };
  }
}

function metadata(entry: CatalogEntry): Omit<ModelInfo, 'id'> {
  return compact({
    name: entry.name,
    contextWindow: entry.contextWindow,
    maxOutput: entry.maxOutput,
    reasoning: entry.reasoning,
    reasoningOptions: entry.reasoningOptions,
    interleaved: entry.interleaved,
    input: entry.input?.length ? entry.input : undefined,
    toolCall: entry.toolCall,
  });
}

/** Drop unset fields so spreading never overwrites a value with `undefined`. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

function push(map: Map<string, CatalogEntry[]>, key: string, entry: CatalogEntry) {
  const list = map.get(key);
  if (list) list.push(entry);
  else map.set(key, [entry]);
}
