import { firstExisting } from '#core/files.ts';
import type { HarnessDescriptor, HarnessEnvironment } from '#core/harnesses/types.ts';
import { openCodeAdapter } from './config.ts';

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
  async configFiles(environment) {
    const dir = homeDir(environment);
    // An existing opencode.jsonc wins, then opencode.json; a new file is created as opencode.jsonc.
    const path = await firstExisting([join(dir, 'opencode.jsonc'), join(dir, 'opencode.json')]);
    return [{ path, adapter: openCodeAdapter }];
  },
};
