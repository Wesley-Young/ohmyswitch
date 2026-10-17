import { readFile, stat } from 'node:fs/promises';

export async function isFile(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function isDirectory(path: string) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** A file's text, or undefined when it does not exist. Other errors are thrown. */
export async function readTextIfExists(path: string) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** The first existing file among candidates in priority order, otherwise the first candidate. */
export async function firstExisting(candidates: readonly [string, ...string[]]) {
  for (const path of candidates) if (await isFile(path)) return path;
  return candidates[0];
}
