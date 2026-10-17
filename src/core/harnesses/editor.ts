import { writeFileAtomic } from '#core/atomic-file.ts';
import { AppError } from '#core/errors.ts';
import { withFileLock } from '#core/file-lock.ts';
import { readTextIfExists } from '#core/files.ts';
import type { HarnessConfigFile } from './types.ts';

import { stat } from 'node:fs/promises';

/** A config file's text, or undefined when it does not exist. Other failures are an AppError naming the file. */
export async function readConfigText(path: string) {
  try {
    return await readTextIfExists(path);
  } catch (error) {
    throw new AppError('precondition_failed', `无法读取 ${path}`, { cause: error });
  }
}

/**
 * Edits harness config files safely. Edits to the same file in this process run one after another; each holds
 * the harness's own lock when it has one, and stops instead of overwriting a change made while computing.
 */
export class ConfigEditor {
  private readonly queues = new Map<string, Promise<unknown>>();

  /**
   * Read the file, compute the new text, and write it atomically. `change` returns undefined, or the same text,
   * to leave the file alone. Existing files keep their permissions. `harnessName` is used in error messages.
   */
  edit(harnessName: string, file: HarnessConfigFile, change: (text: string | undefined) => string | undefined) {
    const run = async () => {
      const text = await readConfigText(file.path);
      const next = change(text);
      if (next === undefined || next === text) return;
      if ((await readConfigText(file.path)) !== text) {
        throw new AppError('precondition_failed', `${harnessName} 的配置文件刚被修改，请重试`);
      }
      const mode = text === undefined ? file.adapter.newFileMode : (await stat(file.path)).mode & 0o777;
      try {
        await writeFileAtomic(file.path, next, { mode });
      } catch (error) {
        throw new AppError('precondition_failed', `无法写入 ${file.path}`, { cause: error });
      }
    };
    const locked = async () => {
      if (!file.lockPath) return run();
      try {
        return await withFileLock(file.lockPath, run);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('precondition_failed', `${harnessName} 正在写入 ${file.path}，请稍后重试`, {
          cause: error,
        });
      }
    };
    const previous = this.queues.get(file.path) ?? Promise.resolve();
    const current = previous.then(locked, locked);
    this.queues.set(
      file.path,
      current.catch(() => {}),
    );
    return current;
  }
}
