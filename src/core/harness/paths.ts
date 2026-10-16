import { isAbsolute, join } from 'node:path';

/** A directory from an environment variable: absolute paths and `~/` paths are honored, anything else is ignored. */
export function resolveDirOverride(home: string, value: string | undefined) {
  const expanded = value?.startsWith('~/') ? join(home, value.slice(2)) : value;
  return expanded && isAbsolute(expanded) ? expanded : undefined;
}
