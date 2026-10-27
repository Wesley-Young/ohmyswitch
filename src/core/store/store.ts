import { z } from 'zod';

import { writeFileAtomic } from '#core/atomic-file.ts';
import { AppError } from '#core/errors.ts';
import { withFileLock } from '#core/file-lock.ts';
import { readTextIfExists } from '#core/files.ts';
import { modelOverride, storedProvider } from '#core/provider.ts';

import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const storeFile = z.object({
  version: z.literal(4),
  providers: z.array(storedProvider),
  modelOverrides: z.record(z.string().min(1).max(256), modelOverride),
});

export type StoreData = z.infer<typeof storeFile>;

const fileName = 'store.json';
/** Several writes in a row are read once, after the file has been quiet this long. */
const reloadDelayMs = 100;

const emptyStore = (): StoreData => ({ version: 4, providers: [], modelOverrides: {} });

/**
 * Upgrade an older store file in place, one version at a time. A version newer than this build is left alone,
 * so validation rejects it instead of dropping fields this build does not know.
 */
function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const data = raw as { version?: unknown };
  // 1 → 2: providers gained the optional `iconUrl`; existing data is unchanged.
  if (data.version === 1) data.version = 2;
  // 2 → 3: providers gained the optional `listedModels`; existing data is unchanged.
  if (data.version === 2) data.version = 3;
  // 3 → 4: add independent, global model overrides.
  if (data.version === 3) Object.assign(data, { version: 4, modelOverrides: {} });
  return data;
}

export interface StoreCallbacks {
  /** The data changed because another process, such as the CLI or the app, wrote the file. */
  onExternalChange?: () => void;
}

/**
 * ohmyswitch's own state in `<dir>/store.json`, shared by every ohmyswitch process. Reads come from memory. Every
 * update holds the cross-process writer lock (`<file>.lock`), reads the file again, and applies the change to
 * what it holds now, so a change another process made meanwhile is kept rather than overwritten; it is then
 * validated and written atomically. Updates in this process also run one after another. The file holds API keys,
 * so the directory is created as `0700` and the file written as `0600`.
 */
export class Store {
  readonly dir: string;
  readonly path: string;
  private readonly callbacks: StoreCallbacks;
  private current: StoreData = emptyStore();
  /** The file's text as last read or written, or undefined while there is no file: what changes are told by. */
  private text: string | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dir: string, callbacks: StoreCallbacks = {}) {
    this.dir = dir;
    this.path = join(dir, fileName);
    this.callbacks = callbacks;
  }

  /** Load the store. A missing file starts empty; an invalid file throws instead of being overwritten. */
  async load() {
    this.adopt(await readTextIfExists(this.path));
  }

  get data(): Readonly<StoreData> {
    return this.current;
  }

  /**
   * Apply `mutate` to a copy of the data as the file holds it now, and persist it. `mutate` must decide from the
   * draft alone, since it may see changes another process made after the caller last read the data. The
   * in-memory state changes only after the write succeeds.
   */
  update<T>(mutate: (draft: StoreData) => T): Promise<T> {
    return this.enqueue(() =>
      this.locked(async () => {
        await this.refresh();
        const draft = structuredClone(this.current);
        const result = mutate(draft);
        const next = storeFile.parse(draft);
        const text = `${JSON.stringify(next, null, 2)}\n`;
        await writeFileAtomic(this.path, text, { mode: 0o600 });
        this.current = next;
        this.text = text;
        return result;
      }),
    );
  }

  /**
   * Watch the file for writes by other processes and take them in. The directory is watched because writers
   * replace the file by renaming. A file that cannot be used is reported to `onError` and the data last read is
   * kept; updates are refused until it is fixed. Returns the function that stops watching.
   */
  async watch(onError: (error: unknown) => void) {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    let timer: NodeJS.Timeout | undefined;
    const watcher = watch(this.dir, (_event, name) => {
      // Some platforms leave out the name; reading the file again is cheap.
      if (name && name !== fileName) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.enqueue(() => this.refresh()).catch(onError);
      }, reloadDelayMs);
    });
    watcher.on('error', onError);
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  }

  /** Resolves once the updates started so far have finished, successfully or not. */
  idle(): Promise<void> {
    return this.queue.then(() => {});
  }

  /** Read the file again; if another process changed it, take its data. */
  private async refresh() {
    const text = await readTextIfExists(this.path);
    if (text === this.text) return;
    try {
      this.adopt(text);
    } catch (error) {
      throw new AppError('precondition_failed', `${this.path} 有错误，修正后才能保存`, { cause: error });
    }
    this.callbacks.onExternalChange?.();
  }

  /** Take the file's text as the current data. Throws, changing nothing, when it is not a valid store. */
  private adopt(text: string | undefined) {
    if (text === undefined) {
      this.current = emptyStore();
    } else {
      const parsed = storeFile.safeParse(migrate(JSON.parse(text)));
      if (!parsed.success) throw new Error(`Invalid store file ${this.path}: ${z.prettifyError(parsed.error)}`);
      this.current = parsed.data;
    }
    this.text = text;
  }

  /** Run `operation` holding the writer lock that every ohmyswitch process takes before writing the file. */
  private async locked<T>(operation: () => Promise<T>) {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    let started = false;
    try {
      return await withFileLock(this.path, () => {
        started = true;
        return operation();
      });
    } catch (error) {
      if (started) throw error;
      throw new AppError('precondition_failed', '另一个 ohmyswitch 进程正在保存数据，请稍后重试', { cause: error });
    }
  }

  /** Run after the operations started so far in this process. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation);
    this.queue = run.catch(() => {});
    return run;
  }
}
