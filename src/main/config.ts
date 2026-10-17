import { app } from 'electron';

import { ohmyswitchHome, resolveDirOverride } from '../core/paths.ts';

import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AppConfig {
  version: string;
  /** ohmyswitch's own directory (`~/.ohmyswitch` or `OHMYSWITCH_HOME`): store.json and cache/. */
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
 * Electron's userData holds only Chromium state and the single-instance lock; ohmyswitch's data lives in
 * `dataDir`. When OHMYSWITCH_HOME is set, userData moves under it too, so one variable isolates a development
 * instance completely from the installed app. Must run before anything touches userData.
 */
export function applyUserDataOverride() {
  if (resolveDirOverride(homedir(), process.env.OHMYSWITCH_HOME)) {
    app.setPath('userData', join(ohmyswitchHome(homedir(), process.env), 'electron'));
  }
}

/** Read once at startup; plugins use `ctx.config` and never read `process.env` directly. */
export function loadConfig(): AppConfig {
  const home = homedir();
  return {
    version: app.getVersion(),
    dataDir: ohmyswitchHome(home, process.env),
    rendererDir: join(import.meta.dirname, '../renderer'),
    rendererDevUrl: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
    home,
    env: { ...process.env },
  };
}
