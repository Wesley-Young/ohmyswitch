import { AppError } from '#core/errors.ts';
import { firstExisting, isDirectory, isFile } from '#core/files.ts';
import type { HarnessConfigFile, HarnessDescriptor, HarnessEnvironment } from '#core/harnesses/types.ts';
import { ompAdapter } from './config.ts';
import { readOmpProfile } from './usage.ts';

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
  async readUsage(environment, scan) {
    const root = configRoot(environment);
    const main = defaultAgentDir(environment);
    const xdg = environment.env.XDG_DATA_HOME;
    const xdgRoot = xdg && isAbsolute(xdg) && process.platform !== 'win32' ? join(xdg, 'omp') : undefined;
    const profiles = new Set<string>();
    for (const base of [root, xdgRoot]) {
      if (!base) continue;
      try {
        for (const entry of await readdir(join(base, 'profiles'), { withFileTypes: true })) {
          if (entry.isDirectory() && profileName.test(entry.name) && !entry.name.endsWith('.'))
            profiles.add(entry.name);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    for (const name of [null, ...profiles]) {
      const profile = name ? join(root, 'profiles', name) : root;
      const agent = name ? join(profile, 'agent') : main;
      const shared = !name && isAbsolute(environment.env.PI_CODING_AGENT_DIR ?? '');
      const xdgProfile = xdgRoot && (name ? join(xdgRoot, 'profiles', name) : xdgRoot);
      const useXdg = agent === join(profile, 'agent') && xdgProfile && (await isDirectory(xdgProfile));
      try {
        await readOmpProfile(
          join(useXdg ? xdgProfile : agent, 'sessions'),
          useXdg ? xdgProfile : profile,
          shared && !useXdg,
          scan,
        );
      } catch {
        scan.incomplete = true;
      }
    }
  },
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
