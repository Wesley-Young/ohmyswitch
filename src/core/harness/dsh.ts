// DeepSeek Harness is not supported yet: it needs `docs/harness/dsh.md` and an adapter before it is listed
// again in `index.ts` and `harnessIds`. Kept for its path rules.
//
// import { resolveDirOverride } from '../paths.ts';
// import type { HarnessDescriptor, HarnessEnvironment } from './types.ts';
//
// import { join } from 'node:path';
//
// const homeDir = ({ home, env }: HarnessEnvironment) => resolveDirOverride(home, env.DSH_HOME) ?? join(home, '.dsh');
//
// /**
//  * DeepSeek Harness composes each profile from patch layers. Providers live in the `llm-pi-ai` entry; the home-level
//  * patch applies to every profile, so it is the file ohmyswitch targets.
//  */
// export const dsh: HarnessDescriptor = {
//   id: 'dsh',
//   name: 'DeepSeek Harness',
//   homepage: 'https://deepseek.com/harness',
//   homeDir,
//   configFiles: (environment) => [join(homeDir(environment), 'cordis.patch.yml')],
// };
