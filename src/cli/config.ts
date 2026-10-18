import { type AppDirs, appDirs } from '#core/paths.ts';

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

/** Replaced with the package version when the CLI is bundled. */
declare const __OMS_VERSION__: string | undefined;

export interface CliConfig {
  version: string;
  /** Where ohmyswitch keeps its files, by kind; the same directories as the GUI. */
  dirs: AppDirs;
  /** Home directory used to locate harness configs. */
  home: string;
  env: Readonly<Record<string, string | undefined>>;
}

/** When run from source, the version of the checkout. */
function sourceVersion() {
  try {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return `${manifest.version}-dev`;
  } catch {
    return 'dev';
  }
}

/** Read once at startup; plugins get their part from `app.ts` and never read `process.env` themselves. */
export function loadConfig(): CliConfig {
  const home = homedir();
  return {
    version: typeof __OMS_VERSION__ === 'string' ? __OMS_VERSION__ : sourceVersion(),
    dirs: appDirs(home, process.env, process.platform),
    home,
    env: { ...process.env },
  };
}
