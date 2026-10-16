import { serviceToken } from '@fraqjs/kernel';

import { type HarnessEnvironment, harnesses } from '../../../core/harness/index.ts';

import { stat } from 'node:fs/promises';

async function exists(path: string, kind: 'file' | 'directory') {
  try {
    const info = await stat(path);
    return kind === 'file' ? info.isFile() : info.isDirectory();
  } catch {
    return false;
  }
}

export class HarnessService {
  static readonly token = serviceToken<HarnessService>('ohmyswitch/harnesses');
  private readonly environment: HarnessEnvironment;

  constructor(environment: HarnessEnvironment) {
    this.environment = environment;
  }

  /** Each supported harness, whether it is present on this machine, and the config file ohmyswitch would use. */
  list() {
    return Promise.all(
      harnesses.map(async (harness) => {
        const candidates = harness.configFiles(this.environment);
        const [detected, ...flags] = await Promise.all([
          exists(harness.homeDir(this.environment), 'directory'),
          ...candidates.map((path) => exists(path, 'file')),
        ]);
        return {
          id: harness.id,
          name: harness.name,
          homepage: harness.homepage,
          detected,
          configPath: candidates.find((_, index) => flags[index]) ?? candidates[0],
        };
      }),
    );
  }
}
