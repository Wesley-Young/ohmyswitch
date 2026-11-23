import { isJsonObject, type JsonObject } from '#core/jsonc.ts';
import type { UsageRecord } from './report.ts';

import { createReadStream, type Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

export const object = (value: unknown): JsonObject => (isJsonObject(value) ? value : {});
export const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
export const modelId = (value: unknown) => (typeof value === 'string' && value.length ? value : null);
export const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

/** Do not follow directory symlinks or discover a transcript outside the selected root. */
export async function* walkFiles(dir: string): AsyncGenerator<string> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (missing(error)) return;
    throw error;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isFile()) yield path;
    else if (entry.isDirectory()) yield* walkFiles(path);
  }
}

/** A complete corrupt row invalidates the file. A writer's incomplete last line can be retried on the next scan. */
export async function readJsonLines(source: string | AsyncIterable<Buffer>, visit: (row: JsonObject) => void) {
  const chunks = typeof source === 'string' ? createReadStream(source) : source;
  const decoder = new StringDecoder('utf8');
  const fragments: string[] = [];
  for await (const chunk of chunks) {
    const text = decoder.write(chunk);
    let start = 0;
    for (let end = text.indexOf('\n'); end !== -1; end = text.indexOf('\n', start)) {
      fragments.push(text.slice(start, end));
      const line = fragments.join('');
      fragments.length = 0;
      if (line.trim()) visit(object(JSON.parse(line)));
      start = end + 1;
    }
    if (start < text.length) fragments.push(text.slice(start));
  }
  const tail = fragments.join('') + decoder.end();
  if (tail.trim()) {
    let row: unknown;
    try {
      row = JSON.parse(tail);
    } catch {
      return;
    }
    visit(object(row));
  }
}

export interface CachedUsage {
  revision: string;
  records: UsageRecord[];
}

/** Cache counters only. A new scan retires files that disappeared and re-parses changed files in full. */
export class UsageScan {
  readonly cache = new Map<string, CachedUsage>();
  readonly records: UsageRecord[] = [];
  incomplete = false;
  private readonly previous: ReadonlyMap<string, CachedUsage>;
  constructor(previous: ReadonlyMap<string, CachedUsage>) {
    this.previous = previous;
  }
  async file(path: string, parse: (path: string) => Promise<UsageRecord[]>) {
    try {
      const info = await stat(path, { bigint: true });
      const revision = [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(':');
      const existing = this.previous.get(path);
      const entry = existing?.revision === revision ? existing : { revision, records: await parse(path) };
      this.cache.set(path, entry);
      for (const record of entry.records) this.records.push(record);
    } catch (error) {
      if (!missing(error)) this.incomplete = true;
    }
  }
}
