import { AppError } from '#core/errors.ts';
import { firstExisting, isDirectory, isFile } from '#core/files.ts';
import type { HarnessConfigFile, HarnessDescriptor, HarnessEnvironment } from '#core/harnesses/types.ts';
import { ompAdapter } from './config.ts';

import { readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

/** omp's config root: `PI_CONFIG_DIR` (default `.omp`), always under the home directory. */
const configRoot = ({ home, env }: HarnessEnvironment) => join(home, env.PI_CONFIG_DIR || '.omp');

/** The default profile's agent directory; `PI_CODING_AGENT_DIR` overrides it when absolute. */
function defaultAgentDir(environment: HarnessEnvironment) {
  const override = environment.env.PI_CODING_AGENT_DIR;
  return override && isAbsolute(override) ? override : join(configRoot(environment), 'agent');
}

/** omp's rule for profile names (`normalizeProfileName`). */
const profileName = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Agent directories of the named profiles under `<root>/profiles`, by name. */
async function profileAgentDirs(root: string) {
  let names: string[];
  try {
    names = await readdir(join(root, 'profiles'));
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const name of names.sort()) {
    if (!profileName.test(name) || name.endsWith('.')) continue;
    const dir = join(root, 'profiles', name, 'agent');
    if (await isDirectory(dir)) dirs.push(dir);
  }
  return dirs;
}

/**
 * The models file of an agent directory: `models.yml`, else an existing `models.yaml`. A `models.json` that omp has
 * not migrated yet would be ignored once `models.yml` exists, so writing waits for omp to migrate it.
 */
async function modelsFile(agentDir: string) {
  const path = await firstExisting([join(agentDir, 'models.yml'), join(agentDir, 'models.yaml')]);
  if (!(await isFile(path)) && (await isFile(join(agentDir, 'models.json')))) {
    throw new AppError('precondition_failed', `${join(agentDir, 'models.json')} 还没有迁移，请先启动一次 omp`);
  }
  return path;
}

/** omp (oh-my-pi). Providers go into the models file of every profile. See `docs/harness/omp.md`. */
export const omp: HarnessDescriptor = {
  id: 'omp',
  name: 'omp',
  homepage: 'https://omp.sh',
  homeDir: configRoot,
  async configFiles(environment) {
    const agentDirs = await profileAgentDirs(configRoot(environment));
    const main = defaultAgentDir(environment);
    if (await isDirectory(main)) agentDirs.unshift(main);
    if (!agentDirs.length) throw new AppError('precondition_failed', 'omp 还没有配置目录，请先启动一次 omp');
    const files: HarnessConfigFile[] = [];
    for (const dir of agentDirs) files.push({ path: await modelsFile(dir), adapter: ompAdapter });
    return files;
  },
  configLocation(files, environment) {
    if (files.length === 1) return files[0].path;
    const root = configRoot(environment);
    const dirs = files.map((file) => relative(root, dirname(file.path)));
    if (dirs.some((dir) => dir.startsWith('..') || isAbsolute(dir))) return files[0].path;
    return join(root, `{${dirs.join(',')}}`, 'models.yml');
  },
};
