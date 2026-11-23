import { readTextIfExists } from '#core/files.ts';
import type { HarnessEnvironment } from '#core/harnesses/types.ts';
import { object, type UsageScan, walkFiles } from '#core/harnesses/usage/files.ts';
import { readTranscript } from '#core/harnesses/usage/transcript.ts';
import { parseJsonc } from '#core/jsonc.ts';
import { resolveDirOverride } from '#core/paths.ts';

import { isAbsolute, join } from 'node:path';

export async function readPiUsage(agent: string, { home, env }: HarnessEnvironment, scan: UsageScan) {
  let configured: unknown = env.PI_CODING_AGENT_SESSION_DIR;
  if (!configured) {
    const settings = await readTextIfExists(join(agent, 'settings.json'));
    configured = object(parseJsonc(settings ?? '{}')).sessionDir;
  }
  const root =
    resolveDirOverride(home, typeof configured === 'string' ? configured : undefined) ?? join(agent, 'sessions');
  const shared = isAbsolute(env.PI_CODING_AGENT_DIR ?? '') && root === join(agent, 'sessions');
  for await (const path of walkFiles(root)) {
    if (path.endsWith('.jsonl')) await scan.file(path, (file) => readTranscript(file, 'pi', shared));
  }
}
