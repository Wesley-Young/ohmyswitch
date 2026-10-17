import { serviceToken } from '@fraqjs/kernel';

import { writeFileAtomic } from '../../../core/atomic-file.ts';
import { AppError } from '../../../core/errors.ts';
import {
  type HarnessDescriptor,
  type HarnessEnvironment,
  type HarnessId,
  harnesses,
  providerKey,
} from '../../../core/harness/index.ts';
import { jsonEqual } from '../../../core/jsonc.ts';
import type { StoredProvider } from '../../../core/provider.ts';
import type { ModelsDevService } from '../models-dev/service.ts';
import type { StoreService } from '../store/service.ts';

import { readFile, stat } from 'node:fs/promises';

async function exists(path: string, kind: 'file' | 'directory') {
  try {
    const info = await stat(path);
    return kind === 'file' ? info.isFile() : info.isDirectory();
  } catch {
    return false;
  }
}

async function readText(path: string) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new AppError('precondition_failed', `无法读取 ${path}`, { cause: error });
  }
}

/**
 * How an applied provider looks in the harness config: `applied` matches what ohmyswitch would write,
 * `modified` was changed outside ohmyswitch, `missing` was removed from the file, `unreadable` could not be checked.
 */
export type ApplicationState = 'applied' | 'modified' | 'missing' | 'unreadable';

export interface HarnessFailure {
  harnessId: HarnessId;
  message: string;
}

export class HarnessService {
  static readonly token = serviceToken<HarnessService>('ohmyswitch/harnesses');
  private readonly environment: HarnessEnvironment;
  private readonly store: StoreService;
  private readonly modelsDev: ModelsDevService;
  /** Edits to the same config file run one after another. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(environment: HarnessEnvironment, store: StoreService, modelsDev: ModelsDevService) {
    this.environment = environment;
    this.store = store;
    this.modelsDev = modelsDev;
  }

  /** Each harness, whether it is present on this machine, and its config file. */
  list() {
    return Promise.all(
      harnesses.map(async (harness) => ({
        id: harness.id,
        name: harness.name,
        homepage: harness.homepage,
        detected: await exists(harness.homeDir(this.environment), 'directory'),
        configPath: await this.configPath(harness),
      })),
    );
  }

  /** For every provider, the harnesses it is applied to and how each config entry looks now. */
  async applications() {
    const result: Record<string, { harnessId: HarnessId; key: string; state: ApplicationState }[]> = {};
    for (const harness of harnesses) {
      const adapter = harness.adapter;
      const applied = this.store.data.providers.filter((provider) => provider.harnesses[harness.id]);
      if (!applied.length) continue;
      let entries: Record<string, unknown> | undefined;
      try {
        entries = adapter.readProviders(await readText(await this.configPath(harness)));
      } catch {
        entries = undefined;
      }
      for (const provider of applied) {
        const key = (provider.harnesses[harness.id] as { key: string }).key;
        const existing = entries?.[key];
        const state: ApplicationState = !entries
          ? 'unreadable'
          : existing === undefined
            ? 'missing'
            : jsonEqual(adapter.entry(provider, existing), existing)
              ? 'applied'
              : 'modified';
        result[provider.id] = [...(result[provider.id] ?? []), { harnessId: harness.id, key, state }];
      }
    }
    return result;
  }

  /**
   * Write a provider into a harness config. The first time, a key is derived from the provider name; if the
   * config already has an entry with that key that ohmyswitch does not own, `replace` must confirm taking it over.
   */
  async apply(providerId: string, harnessId: HarnessId, replace: boolean) {
    const provider = this.provider(providerId);
    const harness = this.harness(harnessId);
    if (!(await exists(harness.homeDir(this.environment), 'directory'))) {
      throw new AppError('precondition_failed', `未发现 ${harness.name}`);
    }
    const adapter = harness.adapter;
    const owned = new Set(
      this.store.data.providers.flatMap((item) => (item.id === provider.id ? [] : [item.harnesses[harnessId]?.key])),
    );
    let key = provider.harnesses[harnessId]?.key;
    const catalog = !key && adapter.reservesCatalogProviders ? await this.catalogProviderIds(harness) : new Set();
    await this.edit(harness, (text) => {
      const entries = adapter.readProviders(text);
      if (!key) {
        const occupied = new Set(adapter.occupiedKeys?.(text));
        key = providerKey(
          provider.name,
          (candidate) =>
            owned.has(candidate) ||
            adapter.reservedKeys.has(candidate) ||
            catalog.has(candidate) ||
            occupied.has(candidate),
        );
        if (entries[key] !== undefined && !replace) {
          throw new AppError('conflict', `${harness.name} 中已有「${key}」`);
        }
      }
      return adapter.write(text, key, adapter.entry(provider, entries[key]));
    });
    const appliedKey = key as string;
    await this.store.update((draft) => {
      const target = draft.providers.find((item) => item.id === providerId);
      if (target) target.harnesses[harnessId] = { key: appliedKey };
    });
    return { key: appliedKey };
  }

  /** Remove a provider from a harness config and forget the application. */
  async unapply(providerId: string, harnessId: HarnessId) {
    const provider = this.provider(providerId);
    const failure = await this.remove(provider, harnessId);
    if (failure) throw new AppError('precondition_failed', failure.message);
    await this.store.update((draft) => {
      const target = draft.providers.find((item) => item.id === providerId);
      if (target) delete target.harnesses[harnessId];
    });
  }

  /** Rewrite a provider in every harness it is applied to, after it changed. Failures are reported, not thrown. */
  async syncProvider(provider: StoredProvider): Promise<HarnessFailure[]> {
    const failures: HarnessFailure[] = [];
    for (const [harnessId, application] of this.applied(provider)) {
      const harness = this.harness(harnessId);
      try {
        const adapter = harness.adapter;
        await this.edit(harness, (text) =>
          adapter.write(text, application.key, adapter.entry(provider, adapter.readProviders(text)[application.key])),
        );
      } catch (error) {
        failures.push({ harnessId, message: error instanceof AppError ? error.message : '写入失败' });
      }
    }
    return failures;
  }

  /** Remove a provider from every harness it is applied to, before it is deleted. Throws on the first failure. */
  async removeProvider(provider: StoredProvider) {
    for (const [harnessId] of this.applied(provider)) {
      const failure = await this.remove(provider, harnessId);
      if (failure) throw new AppError('precondition_failed', failure.message);
    }
  }

  private async remove(provider: StoredProvider, harnessId: HarnessId): Promise<HarnessFailure | undefined> {
    const key = provider.harnesses[harnessId]?.key;
    if (!key) return undefined;
    const harness = this.harness(harnessId);
    try {
      const adapter = harness.adapter;
      await this.edit(harness, (text) =>
        adapter.readProviders(text)[key] === undefined ? text : adapter.write(text, key, undefined),
      );
      return undefined;
    } catch (error) {
      return { harnessId, message: error instanceof AppError ? error.message : '写入失败' };
    }
  }

  /**
   * Read the config, compute the new text, and write it atomically. If the file changed while computing, stop
   * rather than overwrite someone else's edit. Existing files keep their permissions.
   */
  private edit(harness: HarnessDescriptor, change: (text: string | undefined) => string | undefined) {
    const adapter = harness.adapter;
    const run = async () => {
      const path = await this.configPath(harness);
      const text = await readText(path);
      const next = change(text);
      if (next === undefined || next === text) return;
      if ((await readText(path)) !== text) {
        throw new AppError('precondition_failed', `${harness.name} 的配置文件刚被修改，请重试`);
      }
      const mode = text === undefined ? adapter.newFileMode : (await stat(path)).mode & 0o777;
      try {
        await writeFileAtomic(path, next, { mode });
      } catch (error) {
        throw new AppError('precondition_failed', `无法写入 ${path}`, { cause: error });
      }
    };
    const previous = this.queues.get(harness.id) ?? Promise.resolve();
    const current = previous.then(run, run);
    this.queues.set(
      harness.id,
      current.catch(() => {}),
    );
    return current;
  }

  /** Built-in provider ids of a harness that builds on models.dev. Without the catalog, no new key is assigned. */
  private async catalogProviderIds(harness: HarnessDescriptor) {
    try {
      return (await this.modelsDev.index()).providerIds;
    } catch (error) {
      throw new AppError('bad_gateway', `无法读取 models.dev，暂时不能确认 ${harness.name} 的内置供应商，请稍后重试`, {
        cause: error,
      });
    }
  }

  private applied(provider: StoredProvider) {
    return Object.entries(provider.harnesses) as [HarnessId, { key: string }][];
  }

  private async configPath(harness: HarnessDescriptor) {
    const candidates = harness.configFiles(this.environment);
    for (const path of candidates) if (await exists(path, 'file')) return path;
    return candidates[0];
  }

  private provider(providerId: string) {
    const provider = this.store.data.providers.find((item) => item.id === providerId);
    if (!provider) throw new AppError('not_found', '供应商不存在或已删除');
    return provider;
  }

  private harness(harnessId: HarnessId) {
    const harness = harnesses.find((item) => item.id === harnessId);
    if (!harness) throw new AppError('not_found', '不支持这个 Harness');
    return harness;
  }
}
