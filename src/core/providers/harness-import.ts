import type { Endpoint } from '#core/endpoints.ts';
import type { ImportSource } from '#core/harnesses/import.ts';
import type { HarnessId } from '#core/harnesses/types.ts';
import type { ModelInfo, StoredProvider } from '#core/provider.ts';

/** A harness entry by harness and key. */
export interface SourceRef {
  harnessId: HarnessId;
  key: string;
}

interface Connection {
  baseUrl: string;
  endpoint: Endpoint;
  apiKey: string;
}

/**
 * What one import would bring in: entries from one or more harnesses with the same connection, which become one
 * provider applied to each of them. With `target`, an existing provider with the same connection takes the
 * entries over instead. With `reason`, it cannot be imported.
 */
export interface ImportCandidate {
  sources: SourceRef[];
  name: string;
  connection?: Connection;
  models: ModelInfo[];
  target?: { providerId: string; name: string };
  reason?: string;
}

/** Stable across scans while the same entries are found, so a selection made from one scan names the same candidate. */
export function candidateId(sources: readonly SourceRef[]) {
  return JSON.stringify(
    sources
      .map(({ harnessId, key }) => [harnessId, key])
      .sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y)),
  );
}

const sameConnection = (a: Connection | undefined, b: Connection | undefined) =>
  Boolean(a && b && a.baseUrl === b.baseUrl && a.endpoint === b.endpoint && a.apiKey === b.apiKey);

/** Add models not in `models` yet; for ones already there, fill the fields they lack. */
function mergeModels(models: readonly ModelInfo[], more: readonly ModelInfo[]) {
  const byId = new Map(models.map((model) => [model.id, model]));
  for (const model of more) byId.set(model.id, { ...model, ...byId.get(model.id) });
  return [...byId.values()];
}

/**
 * Group the entries found in harness configs into import candidates. Entries with the same Base URL, endpoint and
 * API key become one candidate, unless they are in the same harness: a provider has one entry per harness. A
 * candidate matching an existing provider that is applied to none of its harnesses goes to that provider; one
 * whose match is already applied there duplicates it and is not importable.
 */
export function groupImports(sources: readonly ImportSource[], providers: readonly StoredProvider[]) {
  const candidates: ImportCandidate[] = [];
  for (const { harnessId, key, entry } of sources) {
    const ref = { harnessId, key };
    const name = entry.name?.trim().slice(0, 128).trim() || key;
    if (!entry.importable) {
      candidates.push({ sources: [ref], name, models: [], reason: entry.reason });
      continue;
    }
    if (key.length > 64) {
      candidates.push({ sources: [ref], name, models: [], reason: '名称过长，ohmyswitch 无法管理' });
      continue;
    }
    const connection = { baseUrl: entry.baseUrl, endpoint: entry.endpoint, apiKey: entry.apiKey };
    const group = candidates.find(
      (candidate) =>
        sameConnection(candidate.connection, connection) &&
        !candidate.sources.some((source) => source.harnessId === harnessId),
    );
    if (group) {
      group.sources.push(ref);
      group.models = mergeModels(group.models, entry.models);
    } else {
      candidates.push({ sources: [ref], name, connection, models: [...entry.models] });
    }
  }
  // Harnesses each existing provider is applied to, including those candidates are about to give it.
  const applied = new Map(providers.map((provider) => [provider.id, new Set(Object.keys(provider.harnesses))]));
  for (const candidate of candidates) {
    if (!candidate.connection) continue;
    const matches = providers.filter((provider) => sameConnection(candidate.connection, provider));
    const target = matches.find((provider) =>
      candidate.sources.every((source) => !applied.get(provider.id)?.has(source.harnessId)),
    );
    if (target) {
      candidate.target = { providerId: target.id, name: target.name };
      for (const source of candidate.sources) applied.get(target.id)?.add(source.harnessId);
    } else if (matches.length) {
      candidate.reason = `与「${matches[0].name}」重复`;
    }
  }
  return candidates;
}

/** Models a provider gets from an import: the ones it lacks are added; the ones it has are left as they are. */
export function withImportedModels(models: readonly ModelInfo[], imported: readonly ModelInfo[]) {
  const known = new Set(models.map((model) => model.id));
  return [...models, ...imported.filter((model) => !known.has(model.id))];
}

/** `name`, or with the smallest numeric suffix that makes it unique, within the 128 characters a name may have. */
export function uniqueName(name: string, taken: ReadonlySet<string>) {
  if (!taken.has(name)) return name;
  for (let suffix = 2; ; suffix++) {
    const tail = ` ${suffix}`;
    const candidate = `${name.slice(0, 128 - tail.length).trim()}${tail}`;
    if (!taken.has(candidate)) return candidate;
  }
}
