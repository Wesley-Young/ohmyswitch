import { count, modelId, object, readJsonLines, type UsageScan, walkFiles } from '#core/harnesses/usage/files.ts';
import type { UsageRecord } from '#core/harnesses/usage/report.ts';
import { readSessionFrames } from './zstd.ts';

import { basename, dirname, join } from 'node:path';

async function sessionUsage(path: string) {
  const records: UsageRecord[] = [];
  let route: string | null = null;
  let last: { turn: unknown; step: unknown; index: number } | undefined;
  let inherited = false;
  let seedLength = 0;
  await readJsonLines(path.endsWith('.zstd') ? readSessionFrames(path) : path, (event) => {
    const data = object(event.data);
    if (event.type === 'session') {
      if (typeof event.version !== 'number' || event.version > 4) throw new Error('Unsupported session format');
      inherited = event.isSeeded === true;
      seedLength = count(event.seedLength);
    }
    if (event.type === 'request/context') route = modelId(data.model);
    if (event.type === 'request/header') route = modelId(object(object(data.header).config).model) ?? route;
    if (event.type === 'session/end-seed' && data.inherited === true) inherited = false;
    if (inherited || (typeof event.seq === 'number' && event.seq < seedLength)) return;
    if (event.type === 'llm/retry-started' && last && last.turn === data.turn && last.step === data.step)
      last = undefined;
    let sample = data.usage;
    let model = route;
    switch (event.type) {
      case 'assistant/message':
      case 'assistant/attempt': {
        model = modelId(object(object(data.message).source).model) ?? route;
        if (!sample && Array.isArray(data.stream)) {
          const chunk = data.stream.findLast((item) => object(object(item).chunk).type === 'usage');
          sample = object(object(chunk).chunk).usage;
        }
        break;
      }
      case 'assistant/chunk': {
        const chunk = object(data.chunk);
        if (chunk.type !== 'usage') return;
        sample = chunk.usage;
        break;
      }
      case 'compaction/summary':
        model = modelId(data.model);
        break;
      default:
        return;
    }
    if (!sample) return;
    const usage = object(sample);
    const input = count(usage.inputTokens);
    const output = count(usage.outputTokens);
    const cacheRead = count(usage.cacheReadTokens);
    const cacheWrite = count(usage.cacheWriteTokens);
    const total = count(usage.totalTokens) || input + output + cacheRead + cacheWrite;
    const record = { time: Number(event.time), model, tokens: { input, output, cacheRead, cacheWrite, total } };
    if (event.type === 'compaction/summary') records.push(record);
    else if (last && last.turn === data.turn && last.step === data.step) records[last.index] = record;
    else {
      last = { turn: data.turn, step: data.step, index: records.length };
      records.push(record);
    }
  });
  return records;
}

export async function readDshUsage(home: string, scan: UsageScan) {
  const files = new Map<string, { version: number; path: string }>();
  for await (const path of walkFiles(join(home, 'sessions'))) {
    const match = /^session(?:\.v(\d+))?\.jsonl(?:\.zstd)?$/.exec(basename(path));
    if (!match) continue;
    const dir = dirname(path);
    const version = Number(match[1] ?? 0);
    const current = files.get(dir);
    if (!current || current.version < version) files.set(dir, { version, path });
  }
  for (const { path } of files.values()) await scan.file(path, sessionUsage);
}
