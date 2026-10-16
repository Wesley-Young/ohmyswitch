import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Replace a file atomically: write a sibling temp file, flush it, then rename over the target.
 * Readers see either the old or the new content, never a partial write.
 */
export async function writeFileAtomic(path: string, data: string | Uint8Array, options: { mode?: number } = {}) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    const handle = await open(temp, 'wx', options.mode ?? 0o644);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
