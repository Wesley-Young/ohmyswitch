import { openCodeAdapter } from './opencode-config.ts';
import type { HarnessDescriptor, HarnessEnvironment } from './types.ts';

import { isAbsolute, join } from 'node:path';

function homeDir({ home, env }: HarnessEnvironment) {
  const xdg = env.XDG_CONFIG_HOME;
  return join(xdg && isAbsolute(xdg) ? xdg : join(home, '.config'), 'opencode');
}

export const opencode: HarnessDescriptor = {
  id: 'opencode',
  name: 'OpenCode',
  homepage: 'https://opencode.ai',
  homeDir,
  configFiles(environment) {
    const dir = homeDir(environment);
    return [join(dir, 'opencode.jsonc'), join(dir, 'opencode.json')];
  },
  adapter: openCodeAdapter,
};
