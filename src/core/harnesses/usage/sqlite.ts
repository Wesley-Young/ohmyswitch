import { missing } from './files.ts';

import { access } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';

/** Lazy load SQLite so starting the CLI for unrelated commands never opens a database. */
export async function readDatabase(path: string, read: (db: DatabaseSync) => void) {
  try {
    await access(path);
  } catch (error) {
    if (missing(error)) return;
    throw error;
  }
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    read(db);
  } finally {
    db.close();
  }
}
