import { count, modelId, object, readJsonLines } from './files.ts';
import type { UsageRecord } from './report.ts';

import { createHash } from 'node:crypto';

/** Pi and omp share the assistant envelope but have different auxiliary usage entries. */
export async function readTranscript(path: string, harness: 'pi' | 'omp', sharedDirectory = false) {
  const records: UsageRecord[] = [];
  let ompSession = false;
  await readJsonLines(path, (entry) => {
    if (entry.type === 'title' || entry.runtime || entry.type === 'model_usage') ompSession = true;
    const message = object(entry.message);
    const assistant = entry.type === 'message' && message.role === 'assistant';
    const auxiliary =
      harness === 'omp'
        ? entry.type === 'model_usage'
        : entry.type === 'compaction' ||
          entry.type === 'branch_summary' ||
          (entry.type === 'message' && message.role === 'toolResult');
    if (!assistant && !auxiliary) return;
    const payload = entry.type === 'message' ? message : entry;
    if (!payload.usage) return;
    const usage = object(payload.usage);
    const input = count(usage.input);
    const output = count(usage.output);
    const cacheRead = count(usage.cacheRead);
    const cacheWrite = count(usage.cacheWrite);
    const orchestration = object(usage.orchestration);
    const sum = input + output + cacheRead + cacheWrite;
    const total =
      harness === 'omp'
        ? count(usage.totalTokens) ||
          sum + count(orchestration.input) + count(orchestration.output) + count(orchestration.cacheRead)
        : sum || count(usage.totalTokens);
    if (!total) return;
    const entryTime = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN;
    const messageTime = typeof payload.timestamp === 'number' ? payload.timestamp : NaN;
    const time =
      harness === 'omp' && Number.isFinite(messageTime)
        ? messageTime
        : Number.isFinite(entryTime)
          ? entryTime
          : messageTime;
    const model = modelId(payload.responseModel) ?? modelId(payload.model);
    const identity =
      typeof entry.id === 'string'
        ? JSON.stringify([entry.id, time])
        : createHash('sha256').update(JSON.stringify(entry)).digest('hex');
    records.push({ time, model, identity, tokens: { input, output, cacheRead, cacheWrite, total } });
  });
  if (sharedDirectory && ompSession !== (harness === 'omp')) return [];
  return records;
}
