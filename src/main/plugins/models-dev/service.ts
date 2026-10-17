import { type Logger, serviceToken } from '@fraqjs/kernel';
import { z } from 'zod';

import { writeFileAtomic } from '../../../core/atomic-file.ts';
import { AppError } from '../../../core/errors.ts';
import { readLimitedText } from '../../../core/http.ts';
import type { CatalogFetch } from '../../../core/model-catalog.ts';
import { catalogEntry, ModelsDevIndex, modelsDevUrl, parseModelsDev } from '../../../core/models-dev.ts';

import { readFile } from 'node:fs/promises';

const maxAgeMs = 24 * 60 * 60 * 1000;
const maxBytes = 32 * 1024 * 1024;

const cacheFile = z.object({
  /** Bumped whenever the reduced entry shape changes, so older caches are downloaded again. */
  version: z.literal(2),
  fetchedAt: z.iso.datetime(),
  entries: z.array(catalogEntry),
});

interface Snapshot {
  fetchedAt: number;
  index: ModelsDevIndex;
}

/**
 * The models.dev catalog, reduced and cached on disk for a day. When a refresh fails, a stale copy is used;
 * only a failure with no copy at all is an error.
 */
export class ModelsDevService {
  static readonly token = serviceToken<ModelsDevService>('ohmyswitch/models-dev');
  private readonly path: string;
  private readonly fetch: CatalogFetch;
  private readonly logger: Logger;
  private snapshot: Snapshot | undefined;
  private loadedFromDisk = false;
  private pending: Promise<ModelsDevIndex> | undefined;

  constructor(path: string, fetch: CatalogFetch, logger: Logger) {
    this.path = path;
    this.fetch = fetch;
    this.logger = logger;
  }

  index(): Promise<ModelsDevIndex> {
    this.pending ??= this.resolve().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async resolve() {
    if (!this.loadedFromDisk) {
      this.loadedFromDisk = true;
      this.snapshot ??= await this.readCache();
    }
    if (this.snapshot && Date.now() - this.snapshot.fetchedAt < maxAgeMs) return this.snapshot.index;
    try {
      const entries = await this.download();
      const fetchedAt = new Date();
      this.snapshot = { fetchedAt: fetchedAt.getTime(), index: new ModelsDevIndex(entries) };
      const file: z.infer<typeof cacheFile> = { version: 2, fetchedAt: fetchedAt.toISOString(), entries };
      await writeFileAtomic(this.path, JSON.stringify(file)).catch((error: unknown) =>
        this.logger.warn('Failed to write models.dev cache', error),
      );
      return this.snapshot.index;
    } catch (error) {
      if (this.snapshot) {
        this.logger.warn('Failed to refresh models.dev, using the cached copy', error);
        return this.snapshot.index;
      }
      throw error;
    }
  }

  private async download() {
    const signal = AbortSignal.timeout(30_000);
    let text: string;
    try {
      const response = await this.fetch(modelsDevUrl, { headers: { accept: 'application/json' }, signal });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new Error(`HTTP ${response.status}`);
      }
      text = await readLimitedText(response, maxBytes);
    } catch (error) {
      throw new AppError('bad_gateway', '无法连接到 models.dev', { cause: error });
    }
    let entries: ReturnType<typeof parseModelsDev>;
    try {
      entries = parseModelsDev(JSON.parse(text));
    } catch (error) {
      throw new AppError('bad_gateway', '无法识别 models.dev 返回的数据', { cause: error });
    }
    if (!entries.length) throw new AppError('bad_gateway', 'models.dev 没有返回模型');
    return entries;
  }

  /** A missing or unreadable cache is not an error; the catalog is simply downloaded again. */
  private async readCache(): Promise<Snapshot | undefined> {
    try {
      const parsed = cacheFile.safeParse(JSON.parse(await readFile(this.path, 'utf8')));
      if (!parsed.success) return undefined;
      return { fetchedAt: Date.parse(parsed.data.fetchedAt), index: new ModelsDevIndex(parsed.data.entries) };
    } catch {
      return undefined;
    }
  }
}
