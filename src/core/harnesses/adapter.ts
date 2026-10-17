import type { StoredProvider } from '../provider.ts';

/**
 * Reads and writes the provider entries ohmyswitch owns in one harness config file. Pure text in, text out;
 * file access, conflict checks and bookkeeping live in the caller. See `docs/harness/<id>.md`.
 */
export interface HarnessAdapter {
  /** Provider entries in the config by key. Throws an AppError when the text cannot be edited safely. */
  readProviders(text: string | undefined): Record<string, unknown>;
  /** The entry for `provider` under `key`: owned fields from ohmyswitch, everything else kept from `existing`. */
  entry(provider: StoredProvider, existing: unknown, key: string): unknown;
  /** The config text with `key` set to `entry`, or removed when `entry` is undefined. */
  write(text: string | undefined, key: string, entry: unknown): string;
  /** Keys that must not be used, such as the harness's built-in provider ids. A harness's files share one key. */
  readonly reservedKeys: ReadonlySet<string>;
  /** Whether the harness's built-in providers come from models.dev, so every catalog provider id is reserved too. */
  readonly reservesCatalogProviders?: boolean;
  /** Keys taken elsewhere in the config, outside the entries `readProviders` returns (such as a legacy section). */
  occupiedKeys?(text: string | undefined): string[];
  /** Permissions for a newly created config file; existing files keep theirs. */
  readonly newFileMode: number;
}

/**
 * A config key derived from a provider name: lowercase letters, digits and hyphens, made unique with a numeric
 * suffix. Names without any usable character fall back to `provider`.
 */
export function providerKey(name: string, unavailable: (key: string) => boolean) {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'provider';
  let key = base;
  for (let suffix = 2; unavailable(key); suffix++) key = `${base}-${suffix}`;
  return key;
}
