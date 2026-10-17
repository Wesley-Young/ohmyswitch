import { app } from 'electron';

import { type AppDirs, appDirs } from '#core/paths.ts';

import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AppConfig {
  version: string;
  /** Where ohmyswitch keeps its files, by kind. */
  dirs: AppDirs;
  /** Built renderer files, served in production. */
  rendererDir: string;
  /** Vite dev server URL; set by electron-vite in development only. */
  rendererDevUrl: string | undefined;
  /** Home directory used to locate harness configs. */
  home: string;
  env: Readonly<Record<string, string | undefined>>;
}

const dirs = () => appDirs(homedir(), process.env, process.platform);

/**
 * Electron's default userData is the app's config directory; it holds only Chromium state and the single-instance
 * lock, so it moves to the state directory, out of the way of the files people edit. With OHMYSWITCH_HOME this
 * isolates a development instance completely from the installed app. Must run before anything touches userData.
 */
export function applyUserDataPath() {
  app.setPath('userData', join(dirs().state, 'electron'));
}

/** Read once at startup; `app.ts` hands each plugin its part, and plugins never read `process.env` directly. */
export function loadConfig(): AppConfig {
  const home = homedir();
  return {
    version: app.getVersion(),
    dirs: dirs(),
    rendererDir: join(import.meta.dirname, '../renderer'),
    rendererDevUrl: app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL,
    home,
    env: { ...process.env },
  };
}
