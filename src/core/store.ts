import { z } from 'zod';

import { writeFileAtomic } from './atomic-file.ts';
import { storedProvider } from './provider.ts';

import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const storeFile = z.object({
  version: z.literal(1),
  providers: z.array(storedProvider),
});

export type StoreData = z.infer<typeof storeFile>;

const emptyStore = (): StoreData => ({ version: 1, providers: [] });

/**
 * ohmyswitch's own state in `<dir>/store.json`. Reads come from memory; every update is validated, written
 * atomically, and serialized with other updates in this process. The file holds API keys, so the directory is
 * created as `0700` and the file written as `0600`.
 */
export class Store {
  readonly dir: string;
  readonly path: string;
  private current: StoreData = emptyStore();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dir: string) {
    this.dir = dir;
    this.path = join(dir, 'store.json');
  }

  /** Load the store. A missing file starts empty; an invalid file throws instead of being overwritten. */
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
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      await writeFileAtomic(this.path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      this.current = next;
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
