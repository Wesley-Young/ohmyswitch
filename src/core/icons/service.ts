import { type Logger, serviceToken } from '@fraqjs/kernel';
import { z } from 'zod';

import { writeFileAtomic } from '../atomic-file.ts';
import { AppError } from '../errors.ts';
import type { HttpService } from '../http/service.ts';
import type { StoredProvider } from '../provider.ts';
import type { StoreService } from '../store/service.ts';
import { discoverIcon, iconTypes } from './discover.ts';

import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const maxAgeMs = 24 * 60 * 60 * 1000;
const timeoutMs = 15_000;

/** One provider's cached icon. An entry without `icon` records that none was found, so it is not retried soon. */
const cacheEntry = z.object({
  version: z.literal(1),
  /** The address the icon was looked up from; a different source makes the entry obsolete. */
  source: z.string(),
  fetchedAt: z.iso.datetime(),
  icon: z.object({ type: z.enum(iconTypes), data: z.base64() }).optional(),
});

type CacheEntry = z.infer<typeof cacheEntry>;

export interface IconDeps {
  http: HttpService;
  store: StoreService;
  logger: Logger;
}

/**
 * Provider icons, looked up from the provider's `iconUrl` or else its Base URL's site, and cached on disk for a
 * day per provider. A stale icon is served while it is refreshed in the background; a failed refresh keeps it.
 */
export class IconService {
  static readonly token = serviceToken<IconService>('ohmyswitch/icons');
  private readonly deps: IconDeps;
  private readonly dir: string;
  /** Entries read from disk or fetched this run; `null` means there is no usable file. */
  private readonly entries = new Map<string, CacheEntry | null>();
  private readonly pending = new Map<string, Promise<CacheEntry>>();

  constructor(deps: IconDeps, dir: string) {
    this.deps = deps;
    this.dir = dir;
  }

  /** The provider's icon as a data URL, or null when it has none. Never fails for network reasons. */
  async get(providerId: string): Promise<string | null> {
    const source = this.sourceOf(providerId);
    const entry = await this.cached(providerId, source);
    if (!entry) return toDataUrl(await this.lookup(providerId, source).catch(() => undefined));
    if (Date.now() - Date.parse(entry.fetchedAt) >= maxAgeMs) {
      // Serve what we have now; the next read gets the refreshed icon.
      this.lookup(providerId, source).catch(() => {});
    }
    return toDataUrl(entry);
  }

  /** Look the icon up again now. Fails only when the site cannot be reached; `found` tells whether there is one. */
  async refresh(providerId: string) {
    const entry = await this.lookup(providerId, this.sourceOf(providerId));
    return { found: Boolean(entry.icon) };
  }

  /** Drop the cached icon of a deleted provider. */
  async forget(providerId: string) {
    this.entries.delete(providerId);
    await rm(this.path(providerId), { force: true }).catch((error: unknown) =>
      this.deps.logger.warn('Failed to delete a cached icon', error),
    );
  }

  private sourceOf(providerId: string) {
    const provider = this.deps.store.data.providers.find((item) => item.id === providerId);
    if (!provider) throw new AppError('not_found', '供应商不存在或已删除');
    return iconSource(provider);
  }

  private async cached(providerId: string, source: string) {
    let entry = this.entries.get(providerId);
    if (entry === undefined) {
      entry = await this.read(providerId);
      this.entries.set(providerId, entry);
    }
    return entry?.source === source ? entry : undefined;
  }

  /** Fetch the icon and record the result, sharing a lookup already in flight for the same source. */
  private lookup(providerId: string, source: string) {
    const key = `${providerId}\n${source}`;
    let run = this.pending.get(key);
    if (!run) {
      run = this.fetchAndStore(providerId, source).finally(() => this.pending.delete(key));
      this.pending.set(key, run);
    }
    return run;
  }

  private async fetchAndStore(providerId: string, source: string): Promise<CacheEntry> {
    const previous = await this.cached(providerId, source);
    let entry: CacheEntry;
    let failure: unknown;
    try {
      const icon = await discoverIcon(source, this.deps.http.fetch, AbortSignal.timeout(timeoutMs));
      entry = {
        version: 1,
        source,
        fetchedAt: new Date().toISOString(),
        ...(icon ? { icon: { type: icon.type, data: Buffer.from(icon.data).toString('base64') } } : {}),
      };
    } catch (error) {
      // Unreachable: keep the old icon, if any, but wait a day before trying again on its own.
      failure = error;
      entry = { ...previous, version: 1, source, fetchedAt: new Date().toISOString() };
      this.deps.logger.debug(`Icon lookup for provider ${providerId} failed: ${String(error)}`);
    }
    this.entries.set(providerId, entry);
    await writeFileAtomic(this.path(providerId), JSON.stringify(entry)).catch((error: unknown) =>
      this.deps.logger.warn('Failed to write the icon cache', error),
    );
    if (failure) throw failure;
    return entry;
  }

  /** A missing or unreadable file is not an error; the icon is simply looked up again. */
  private async read(providerId: string) {
    try {
      const parsed = cacheEntry.safeParse(JSON.parse(await readFile(this.path(providerId), 'utf8')));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  // Provider ids are validated UUIDs, so they are safe as file names.
  private path(providerId: string) {
    return join(this.dir, `${providerId}.json`);
  }
}

/** The address an icon is looked up from: the provider's own choice, else the root of its Base URL's site. */
export const iconSource = (provider: Pick<StoredProvider, 'baseUrl' | 'iconUrl'>) =>
  provider.iconUrl ?? `${new URL(provider.baseUrl).origin}/`;

const toDataUrl = (entry: CacheEntry | undefined) =>
  entry?.icon ? `data:${entry.icon.type};base64,${entry.icon.data}` : null;
