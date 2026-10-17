import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';

/**
 * A cross-process writer lock compatible with DeepSeek Harness (`@deepseek-ai/dsh-atomic-write`'s `withFileLock`):
 * a sibling `<path>.lock` created exclusively, holding the holder's PID. A lock whose holder no longer exists is
 * taken over through a `<lock>.takeover-<hash>` claim, so two contenders cannot both remove it. Readers stay
 * lock-free because writes are atomic renames.
 */
export async function withFileLock<T>(path: string, operation: () => Promise<T>, waitMs = 5_000): Promise<T> {
  const lockPath = `${path}.lock`;
  const deadline = Date.now() + waitMs;
  let delay = 20;
  for (;;) {
    try {
      await writeFile(lockPath, `${process.pid}\n`, { mode: 0o600, flag: 'wx' });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (await takeOverExitedLock(lockPath)) continue;
    }
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for the writer lock at ${lockPath}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 200);
  }
  try {
    return await operation();
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function readLockRecord(lockPath: string) {
  try {
    return await readFile(lockPath, 'utf8');
  } catch {
    return undefined;
  }
}

/** Whether the PID in a complete lock record names a process that no longer exists. */
function holderExited(record: string) {
  if (!/^\d+\n$/.test(record)) return false;
  const pid = Number(record.trim());
  if (pid === 0 || pid > 0x7fffffff || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

async function takeOverExitedLock(lockPath: string) {
  const record = await readLockRecord(lockPath);
  if (record === undefined || !holderExited(record)) return false;
  const claim = `${lockPath}.takeover-${createHash('sha256').update(record).digest('hex').slice(0, 16)}`;
  try {
    await writeFile(claim, `${process.pid}\n`, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
  try {
    if ((await readLockRecord(lockPath)) !== record || !holderExited(record)) return false;
    await rm(lockPath, { force: true });
    return true;
  } finally {
    // A claim left behind names a record that is no longer the lock, so it blocks no later takeover.
    await rm(claim, { force: true }).catch(() => {});
  }
}
