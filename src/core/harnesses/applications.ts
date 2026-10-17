import { jsonEqual } from '../jsonc.ts';
import type { StoredProvider } from '../provider.ts';
import { providerKey } from './adapter.ts';
import type { HarnessConfigFile } from './types.ts';

/**
 * How an applied provider looks in the harness config: `applied` matches what ohmyswitch would write,
 * `modified` was changed outside ohmyswitch, `missing` was removed from the file, `unreadable` could not be checked.
 * A harness with several files reports the worst of them.
 */
export type ApplicationState = 'applied' | 'modified' | 'missing' | 'unreadable';

const severity: Record<ApplicationState, number> = { applied: 0, missing: 1, modified: 2, unreadable: 3 };

export function worseState(a: ApplicationState, b: ApplicationState) {
  return severity[b] > severity[a] ? b : a;
}

/** The state of `key` in one file, given the entries read from it, or undefined when it could not be read. */
export function entryState(
  file: HarnessConfigFile,
  provider: StoredProvider,
  key: string,
  entries: Record<string, unknown> | undefined,
): ApplicationState {
  if (!entries) return 'unreadable';
  const existing = entries[key];
  if (existing === undefined) return 'missing';
  try {
    return jsonEqual(file.adapter.entry(provider, existing, key), existing) ? 'applied' : 'modified';
  } catch {
    // The provider cannot be written as it is now (for example, it has no models left).
    return 'modified';
  }
}

/** Throw before touching any file when one of them cannot take the provider as it is (such as without models). */
export function assertWritable(files: readonly HarnessConfigFile[], provider: StoredProvider, key: string) {
  for (const file of files) file.adapter.entry(provider, undefined, key);
}

/** A config file with its current text and the provider entries in it. */
export interface ConfigContent {
  file: HarnessConfigFile;
  text: string | undefined;
  entries: Record<string, unknown>;
}

/**
 * A key for a provider's first application, derived from its name. It avoids keys the adapters reserve or find
 * taken elsewhere in the files, and any key `taken` rejects. It may still name an existing provider entry.
 */
export function chooseKey(name: string, contents: readonly ConfigContent[], taken: (key: string) => boolean) {
  return providerKey(
    name,
    (candidate) =>
      taken(candidate) ||
      contents.some(
        ({ file, text }) =>
          file.adapter.reservedKeys.has(candidate) || Boolean(file.adapter.occupiedKeys?.(text).includes(candidate)),
      ),
  );
}
