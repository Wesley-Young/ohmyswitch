import { AppError } from '../errors.ts';
import { isDirectory, readTextIfExists } from '../files.ts';
import type { HarnessConfigFile, HarnessDescriptor, HarnessEnvironment } from '../harnesses/types.ts';
import { isJsonObject } from '../jsonc.ts';
import { resolveDirOverride } from '../paths.ts';
import { dshCredentialsAdapter, dshPatchAdapter, dshUnsupportedEndpoints, patchSetsProviders } from './config.ts';

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const homeDir = ({ home, env }: HarnessEnvironment) => resolveDirOverride(home, env.DSH_HOME) ?? join(home, '.dsh');

/** Only the base bundle mounts `llm-pi-ai` (DSH 0.2.0-rc.2), so only profiles built on it can take providers. */
async function mountsProviders(profileDir: string) {
  try {
    const manifest: unknown = JSON.parse((await readTextIfExists(join(profileDir, 'package.json'))) ?? 'null');
    const dsh = isJsonObject(manifest) ? manifest.dsh : undefined;
    const profile = isJsonObject(dsh) ? dsh.profile : undefined;
    const bundles = isJsonObject(profile) ? profile.bundles : undefined;
    return Array.isArray(bundles) && bundles.includes('@deepseek-ai/dsh-base');
  } catch {
    return false;
  }
}

/** Profile directories under `<home>/profiles` that mount `llm-pi-ai`, by name. */
async function targetProfiles(home: string) {
  const profilesDir = join(home, 'profiles');
  let names: string[];
  try {
    names = await readdir(profilesDir);
  } catch {
    return [];
  }
  const profiles: string[] = [];
  for (const name of names.sort()) {
    // Node reserves node_modules, which DSH uses for shared packages.
    if (name === 'node_modules') continue;
    const dir = join(profilesDir, name);
    if ((await isDirectory(dir)) && (await mountsProviders(dir))) profiles.push(name);
  }
  return profiles;
}

/**
 * DeepSeek Harness. Providers go into every profile's own patch rather than the home-level one, which would
 * replace the providers configured in DSH's own UI; API keys go into the credentials file. See `docs/harness/dsh.md`.
 */
export const dsh: HarnessDescriptor = {
  id: 'dsh',
  name: 'DeepSeek Harness',
  homepage: 'https://github.com/deepseek-ai/deepseek-harness',
  homeDir,
  async configFiles(environment) {
    const home = homeDir(environment);
    let homePatch: string | undefined;
    try {
      homePatch = await readTextIfExists(join(home, 'cordis.patch.yml'));
    } catch (error) {
      throw new AppError('precondition_failed', `无法读取 ${join(home, 'cordis.patch.yml')}`, { cause: error });
    }
    if (patchSetsProviders(homePatch)) {
      throw new AppError(
        'precondition_failed',
        `${join(home, 'cordis.patch.yml')} 覆盖了 llm-pi-ai 的配置，写入各 profile 的供应商不会生效`,
      );
    }
    const profiles = await targetProfiles(home);
    if (!profiles.length)
      throw new AppError('precondition_failed', 'DeepSeek Harness 中还没有 profile，请先启动一次 DeepSeek Harness');
    const credentials = join(home, '.credentials.yaml');
    // Keys first, so a route never names a reference that is not stored yet.
    const files: HarnessConfigFile[] = [{ path: credentials, adapter: dshCredentialsAdapter, lockPath: credentials }];
    for (const name of profiles) {
      const dir = join(home, 'profiles', name);
      // DSH's config editor holds the profile manifest's lock while it writes the patch.
      files.push({
        path: join(dir, 'cordis.patch.yml'),
        adapter: dshPatchAdapter,
        lockPath: join(dir, 'package.json'),
      });
    }
    return files;
  },
  configLocation(files, environment) {
    const patches = files.filter((file) => file.adapter === dshPatchAdapter);
    if (patches.length === 1) return patches[0].path;
    const names = patches.map((file) => file.path.split(/[\\/]/).at(-2));
    return join(homeDir(environment), 'profiles', `{${names.join(',')}}`, 'cordis.patch.yml');
  },
  unsupportedEndpoints: dshUnsupportedEndpoints,
};
