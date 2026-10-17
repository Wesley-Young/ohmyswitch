import type { HarnessDescriptor, HarnessEnvironment } from '../harnesses/types.ts';
import { resolveDirOverride } from '../paths.ts';
import { piAdapter } from './config.ts';

import { join } from 'node:path';

const homeDir = ({ home, env }: HarnessEnvironment) =>
  resolveDirOverride(home, env.PI_CODING_AGENT_DIR) ?? join(home, '.pi', 'agent');

export const pi: HarnessDescriptor = {
  id: 'pi',
  name: 'Pi',
  homepage: 'https://pi.dev',
  homeDir,
  configFiles: async (environment) => [{ path: join(homeDir(environment), 'models.json'), adapter: piAdapter }],
};
