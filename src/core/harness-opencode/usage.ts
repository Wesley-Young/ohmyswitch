import type { HarnessEnvironment } from '#core/harnesses/types.ts';
import { count, modelId, type UsageScan } from '#core/harnesses/usage/files.ts';
import { readDatabase } from '#core/harnesses/usage/sqlite.ts';
import { resolveDirOverride } from '#core/paths.ts';

import { join, resolve } from 'node:path';

const legacyMessages = `
  SELECT time_created, json_extract(data, '$.modelID'), json_extract(data, '$.tokens')
  FROM message
  WHERE json_extract(data, '$.role') = 'assistant' AND json_extract(data, '$.time.completed') IS NOT NULL`;

// A migrated database still contains the frozen V1 tables. Forks copy earlier messages into V2.
const messages = `
  SELECT m.time_created, json_extract(m.data, '$.model.id'), json_extract(m.data, '$.tokens')
  FROM session_message m JOIN session_v2 s ON s.id = m.session_id
  WHERE (s.fork_session_id IS NULL OR m.time_created >= s.time_created)
    AND ((m.type = 'assistant' AND json_extract(m.data, '$.time.completed') IS NOT NULL)
      OR (m.type = 'compaction' AND json_extract(m.data, '$.status') IN ('completed', 'failed')))`;

// Title calls only have events. Compaction events settle during the compaction message's lifetime.
// Prefer its final counters and model when present, retaining event-only spend as unattributed.
const auxiliaryEvents = `
  SELECT e.created, NULL, json_extract(e.data, '$.tokens')
  FROM event e JOIN session_v2 s ON s.id = e.aggregate_id
  WHERE e.type = 'session.usage.recorded.1'
    AND (s.fork_session_id IS NULL OR e.created >= s.time_created)
    AND (json_extract(e.data, '$.source') = 'title'
      OR (json_extract(e.data, '$.source') = 'compaction' AND NOT EXISTS (
        SELECT 1 FROM session_message m WHERE m.session_id = s.id AND m.type = 'compaction'
          AND e.created BETWEEN m.time_created AND m.time_updated
          AND json_extract(m.data, '$.status') IN ('completed', 'failed')
          AND json_type(m.data, '$.tokens') = 'object'
      )))`;

export async function readOpenCodeUsage({ home, env }: HarnessEnvironment, scan: UsageScan) {
  if (env.OPENCODE_DB === ':memory:') return;
  const data = join(resolveDirOverride(home, env.XDG_DATA_HOME) ?? join(home, '.local', 'share'), 'opencode');
  await readDatabase(resolve(data, env.OPENCODE_DB || 'opencode.db'), (db) => {
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => row.name),
    );
    const v2 = tables.has('session_v2') && tables.has('session_message');
    const sources = v2 ? [messages] : [legacyMessages];
    if (v2 && tables.has('event')) sources.push(auxiliaryEvents);
    const query = db.prepare(`WITH usage(time, model, tokens) AS (${sources.join(' UNION ALL ')})
      SELECT time, model, json_extract(tokens,'$.input') AS input, json_extract(tokens,'$.output') AS output,
        json_extract(tokens,'$.reasoning') AS reasoning, json_extract(tokens,'$.cache.read') AS cacheRead,
        json_extract(tokens,'$.cache.write') AS cacheWrite FROM usage WHERE tokens IS NOT NULL`);
    for (const row of query.iterate()) {
      const input = count(row.input);
      const output = count(row.output) + count(row.reasoning);
      const cacheRead = count(row.cacheRead);
      const cacheWrite = count(row.cacheWrite);
      scan.records.push({
        time: Number(row.time),
        model: modelId(row.model),
        tokens: { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite },
      });
    }
  });
}
