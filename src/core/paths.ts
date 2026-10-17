import { isAbsolute, join } from 'node:path';

/** A directory from an environment variable: absolute paths and `~/` paths are honored, anything else is ignored. */
export function resolveDirOverride(home: string, value: string | undefined) {
  const expanded = value?.startsWith('~/') ? join(home, value.slice(2)) : value;
  return expanded && isAbsolute(expanded) ? expanded : undefined;
}

/**
 * ohmyswitch's own directory, shared by every front end (GUI now, CLI/TUI later): `OHMYSWITCH_HOME` when set,
 * otherwise `~/.ohmyswitch`. It holds `store.json` and `cache/`.
 */
export function ohmyswitchHome(home: string, env: Readonly<Record<string, string | undefined>>) {
  return resolveDirOverride(home, env.OHMYSWITCH_HOME) ?? join(home, '.ohmyswitch');
}
