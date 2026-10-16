import { serviceToken } from '@fraqjs/kernel';
import { z } from 'zod';

import { writeFileAtomic } from '../../../core/atomic-file.ts';
import { storedProvider } from '../../../core/provider.ts';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const storeFile = z.object({
  version: z.literal(1),
  providers: z.array(storedProvider),
});

export type StoreData = z.infer<typeof storeFile>;

const emptyStore = (): StoreData => ({ version: 1, providers: [] });

/**
 * ohmyswitch's own state in `<dataDir>/store.json`. Reads come from memory; every update is validated,
 * written atomically, and serialized with other updates.
 */
export class StoreService {
  static readonly token = serviceToken<StoreService>('ohmyswitch/store');
  readonly path: string;
  private current: StoreData = emptyStore();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string) {
    this.path = join(dataDir, 'store.json');
  }

  /** Load the store. A missing file starts empty; an invalid file stops startup instead of being overwritten. */
  async load() {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const parsed = storeFile.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error(`Invalid store file ${this.path}: ${z.prettifyError(parsed.error)}`);
    this.current = parsed.data;
  }

  get data(): Readonly<StoreData> {
    return this.current;
  }

  /** Apply `mutate` to a copy of the data and persist it. The in-memory state changes only after the write succeeds. */
  update<T>(mutate: (draft: StoreData) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const draft = structuredClone(this.current);
      const result = mutate(draft);
      const next = storeFile.parse(draft);
      await writeFileAtomic(this.path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      this.current = next;
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
