import { app } from 'electron';

import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export interface AppConfig {
  version: string;
  /** Where ohmyswitch keeps its own state (store.json). */
  dataDir: string;
  /** Built renderer files, served in production. */
  rendererDir: string;
  /** Vite dev server URL; set by electron-vite in development only. */
  rendererDevUrl: string | undefined;
  /** Home directory used to locate harness configs. */
  home: string;
  env: Readonly<Record<string, string | undefined>>;
}

/**
 * Honor OHMYSWITCH_DATA_DIR before anything touches userData. The single-instance lock and Chromium caches
 * live there too, so tests and development builds stay isolated from the installed app.
 */
export function applyDataDirOverride() {
  const override = process.env.OHMYSWITCH_DATA_DIR;
  if (override && isAbsolute(override)) app.setPath('userData', override);
}

/** Read once at startup; plugins use `ctx.config` and never read `process.env` directly. */
export function loadConfig(): AppConfig {
  return {
    version: app.getVersion(),
    dataDir: app.getPath('userData'),
    rendererDir: join(import.meta.dirname, '../renderer'),
    rendererDevUrl: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
    home: homedir(),
    env: { ...process.env },
  };
}
