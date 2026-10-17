import { isAbsolute, join } from 'node:path';

/** A directory from an environment variable: absolute paths and `~/` paths are honored, anything else is ignored. */
export function resolveDirOverride(home: string, value: string | undefined) {
  const expanded = value?.startsWith('~/') ? join(home, value.slice(2)) : value;
  return expanded && isAbsolute(expanded) ? expanded : undefined;
}

/** Where ohmyswitch keeps each kind of file, shared by every front end (GUI now, CLI/TUI later). */
export interface AppDirs {
  /** Files users and agents edit: `plugins.yml`, `plugins.patch.yml`. */
  config: string;
  /** What ohmyswitch records: `store.json`. */
  data: string;
  /** Anything that can be fetched again; safe to delete. */
  cache: string;
  /** Runtime state that is neither: Electron's userData. */
  state: string;
  /** `ohmyswitch.log` and the previous one. */
  logs: string;
}

const name = 'ohmyswitch';

/**
 * Each platform's conventional directories: XDG on Linux, `~/Library` on macOS, `%APPDATA%` and `%LOCALAPPDATA%`
 * on Windows. `OHMYSWITCH_HOME` puts all of them under one directory instead, to isolate a development instance.
 */
export function appDirs(home: string, env: Readonly<Record<string, string | undefined>>, platform: string): AppDirs {
  const root = resolveDirOverride(home, env.OHMYSWITCH_HOME);
  if (root) {
    return {
      config: join(root, 'config'),
      data: join(root, 'data'),
      cache: join(root, 'cache'),
      state: join(root, 'state'),
      logs: join(root, 'state', 'logs'),
    };
  }
  if (platform === 'darwin') {
    const support = join(home, 'Library', 'Application Support', name);
    return {
      config: support,
      data: support,
      cache: join(home, 'Library', 'Caches', name),
      state: support,
      logs: join(home, 'Library', 'Logs', name),
    };
  }
  if (platform === 'win32') {
    const roaming = join(resolveDirOverride(home, env.APPDATA) ?? join(home, 'AppData', 'Roaming'), name);
    const local = join(resolveDirOverride(home, env.LOCALAPPDATA) ?? join(home, 'AppData', 'Local'), name);
    return { config: roaming, data: roaming, cache: join(local, 'Cache'), state: local, logs: join(local, 'Logs') };
  }
  const xdg = (variable: string, fallback: string) =>
    join(resolveDirOverride(home, env[variable]) ?? join(home, fallback), name);
  const state = xdg('XDG_STATE_HOME', join('.local', 'state'));
  return {
    config: xdg('XDG_CONFIG_HOME', '.config'),
    data: xdg('XDG_DATA_HOME', join('.local', 'share')),
    cache: xdg('XDG_CACHE_HOME', '.cache'),
    state,
    logs: join(state, 'logs'),
  };
}
