import { count, modelId, type UsageScan, walkFiles } from '#core/harnesses/usage/files.ts';
import { readDatabase } from '#core/harnesses/usage/sqlite.ts';
import { readTranscript } from '#core/harnesses/usage/transcript.ts';

import { join, relative, sep } from 'node:path';

export async function readOmpProfile(sessions: string, profile: string, shared: boolean, scan: UsageScan) {
  let found = false;
  for await (const path of walkFiles(sessions)) {
    if (
      !path.endsWith('.jsonl') ||
      relative(sessions, path)
        .split(sep)
        .some((part) => part.startsWith('.omp-gc-compress-'))
    )
      continue;
    found = true;
    await scan.file(path, (file) => readTranscript(file, 'omp', shared));
  }
  if (found) return;
  // The native index may retain usage after a transcript is removed. Never add both sources for one profile.
  await readDatabase(join(profile, 'stats.db'), (db) => {
    for (const row of db
      .prepare(
        'SELECT entry_id,timestamp,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,total_tokens FROM messages',
      )
      .iterate()) {
      scan.records.push({
        time: Number(row.timestamp),
        identity: JSON.stringify([row.entry_id, row.timestamp]),
        model: modelId(row.model),
        tokens: {
          input: count(row.input_tokens),
          output: count(row.output_tokens),
          cacheRead: count(row.cache_read_tokens),
          cacheWrite: count(row.cache_write_tokens),
          total: count(row.total_tokens),
        },
      });
    }
  });
}
