import { serviceToken } from '@fraqjs/kernel';

import { writeFileAtomic } from '../../../core/atomic-file.ts';
import { AppError } from '../../../core/errors.ts';
import { withFileLock } from '../../../core/file-lock.ts';
import { isDirectory, readTextIfExists } from '../../../core/files.ts';
import {
  type HarnessConfigFile,
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

import { stat } from 'node:fs/promises';

async function readText(path: string) {
  try {
    return await readTextIfExists(path);
  } catch (error) {
    throw new AppError('precondition_failed', `无法读取 ${path}`, { cause: error });
  }
}

const failureMessage = (error: unknown) => (error instanceof AppError ? error.message : '写入失败');

/**
 * How an applied provider looks in the harness config: `applied` matches what ohmyswitch would write,
 * `modified` was changed outside ohmyswitch, `missing` was removed from the file, `unreadable` could not be checked.
 * A harness with several files reports the worst of them.
 */
export type ApplicationState = 'applied' | 'modified' | 'missing' | 'unreadable';

const severity: Record<ApplicationState, number> = { applied: 0, missing: 1, modified: 2, unreadable: 3 };

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

  /** Each harness, whether it is present on this machine, where its config is, and which endpoints it cannot serve. */
  list() {
    return Promise.all(
      harnesses.map(async (harness) => ({
        id: harness.id,
        name: harness.name,
        homepage: harness.homepage,
        detected: await isDirectory(harness.homeDir(this.environment)),
        configPath: await this.configLocation(harness),
        unsupportedEndpoints: [...(harness.unsupportedEndpoints ?? [])],
      })),
    );
  }

  /** For every provider, the harnesses it is applied to and how each config entry looks now. */
  async applications() {
    const result: Record<string, { harnessId: HarnessId; key: string; state: ApplicationState }[]> = {};
    for (const harness of harnesses) {
      const applied = this.store.data.providers.filter((provider) => provider.harnesses[harness.id]);
      if (!applied.length) continue;
      // Per file, the entries in it, or undefined when it cannot be read.
      let files: { file: HarnessConfigFile; entries: Record<string, unknown> | undefined }[] | undefined;
      try {
        files = await Promise.all(
          (await harness.configFiles(this.environment)).map(async (file) => {
            try {
              return { file, entries: file.adapter.readProviders(await readText(file.path)) };
            } catch {
              return { file, entries: undefined };
            }
          }),
        );
      } catch {
        files = undefined;
      }
      for (const provider of applied) {
        const key = (provider.harnesses[harness.id] as { key: string }).key;
        let state: ApplicationState = files ? 'applied' : 'unreadable';
        for (const { file, entries } of files ?? []) {
          const existing = entries?.[key];
          const fileState: ApplicationState = !entries
            ? 'unreadable'
            : existing === undefined
              ? 'missing'
              : this.matches(file, provider, existing, key)
                ? 'applied'
                : 'modified';
          if (severity[fileState] > severity[state]) state = fileState;
        }
        result[provider.id] = [...(result[provider.id] ?? []), { harnessId: harness.id, key, state }];
      }
    }
    return result;
  }

  /**
   * Write a provider into a harness's config files. The first time, a key is derived from the provider name; if a
   * file already has an entry with that key that ohmyswitch does not own, `replace` must confirm taking it over.
   */
  async apply(providerId: string, harnessId: HarnessId, replace: boolean) {
    const provider = this.provider(providerId);
    const harness = this.harness(harnessId);
    if (!(await isDirectory(harness.homeDir(this.environment)))) {
      throw new AppError('precondition_failed', `未发现 ${harness.name}`);
    }
    if (harness.unsupportedEndpoints?.includes(provider.endpoint)) {
      throw new AppError('precondition_failed', `${harness.name} 不支持这个供应商的端点`);
    }
    const files = await harness.configFiles(this.environment);
    const key = provider.harnesses[harnessId]?.key ?? (await this.newKey(provider, harness, files, replace));
    this.assertWritable(files, provider, key);
    let written = 0;
    let failure: string | undefined;
    for (const file of files) {
      try {
        await this.writeEntry(harness, file, provider, key);
        written++;
      } catch (error) {
        failure = failureMessage(error);
        break;
      }
    }
    // Once any file holds the entry, it is ohmyswitch's: a retry must not mistake it for someone else's.
    if (written > 0) {
      await this.store.update((draft) => {
        const target = draft.providers.find((item) => item.id === providerId);
        if (target) target.harnesses[harnessId] = { key };
      });
    }
    if (failure) throw new AppError('precondition_failed', failure);
    return { key };
  }

  /** Remove a provider from a harness's config files and forget the application. */
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
        const files = await harness.configFiles(this.environment);
        this.assertWritable(files, provider, application.key);
        for (const file of files) await this.writeEntry(harness, file, provider, application.key);
      } catch (error) {
        failures.push({ harnessId, message: failureMessage(error) });
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

  /** Remove the entry from every file, in reverse write order. Every file is tried; the first failure is reported. */
  private async remove(provider: StoredProvider, harnessId: HarnessId): Promise<HarnessFailure | undefined> {
    const key = provider.harnesses[harnessId]?.key;
    if (!key) return undefined;
    const harness = this.harness(harnessId);
    let failure: HarnessFailure | undefined;
    try {
      for (const file of (await harness.configFiles(this.environment)).reverse()) {
        try {
          await this.edit(harness, file, (text) =>
            file.adapter.readProviders(text)[key] === undefined ? text : file.adapter.write(text, key, undefined),
          );
        } catch (error) {
          failure ??= { harnessId, message: failureMessage(error) };
        }
      }
    } catch (error) {
      failure ??= { harnessId, message: failureMessage(error) };
    }
    return failure;
  }

  /**
   * A key for a provider's first application: derived from its name, avoiding keys reserved by the harness, owned
   * by other ohmyswitch providers or taken elsewhere in the files. An existing entry with the key needs `replace`.
   */
  private async newKey(
    provider: StoredProvider,
    harness: HarnessDescriptor,
    files: readonly HarnessConfigFile[],
    replace: boolean,
  ) {
    const owned = new Set(
      this.store.data.providers.flatMap((item) => (item.id === provider.id ? [] : [item.harnesses[harness.id]?.key])),
    );
    const catalog = files.some((file) => file.adapter.reservesCatalogProviders)
      ? await this.catalogProviderIds(harness)
      : new Set<string>();
    const contents = await Promise.all(
      files.map(async (file) => {
        const text = await readText(file.path);
        return { file, text, entries: file.adapter.readProviders(text) };
      }),
    );
    const unavailable = (candidate: string) =>
      owned.has(candidate) ||
      catalog.has(candidate) ||
      contents.some(
        ({ file, text }) =>
          file.adapter.reservedKeys.has(candidate) || Boolean(file.adapter.occupiedKeys?.(text).includes(candidate)),
      );
    const key = providerKey(provider.name, unavailable);
    if (!replace && contents.some(({ entries }) => entries[key] !== undefined)) {
      throw new AppError('conflict', `${harness.name} 中已有「${key}」`);
    }
    return key;
  }

  /** Fail before touching any file when one of them cannot take the provider as it is (such as without models). */
  private assertWritable(files: readonly HarnessConfigFile[], provider: StoredProvider, key: string) {
    for (const file of files) file.adapter.entry(provider, undefined, key);
  }

  private matches(file: HarnessConfigFile, provider: StoredProvider, existing: unknown, key: string) {
    try {
      return jsonEqual(file.adapter.entry(provider, existing, key), existing);
    } catch {
      // The provider cannot be written as it is now (for example, it has no models left).
      return false;
    }
  }

  private writeEntry(harness: HarnessDescriptor, file: HarnessConfigFile, provider: StoredProvider, key: string) {
    return this.edit(harness, file, (text) =>
      file.adapter.write(text, key, file.adapter.entry(provider, file.adapter.readProviders(text)[key], key)),
    );
  }

  /**
   * Read a config file, compute the new text, and write it atomically, holding the harness's lock if it has one.
   * If the file changed while computing, stop rather than overwrite someone else's edit. Existing files keep their
   * permissions.
   */
  private edit(
    harness: HarnessDescriptor,
    file: HarnessConfigFile,
    change: (text: string | undefined) => string | undefined,
  ) {
    const run = async () => {
      const text = await readText(file.path);
      const next = change(text);
      if (next === undefined || next === text) return;
      if ((await readText(file.path)) !== text) {
        throw new AppError('precondition_failed', `${harness.name} 的配置文件刚被修改，请重试`);
      }
      const mode = text === undefined ? file.adapter.newFileMode : (await stat(file.path)).mode & 0o777;
      try {
        await writeFileAtomic(file.path, next, { mode });
      } catch (error) {
        throw new AppError('precondition_failed', `无法写入 ${file.path}`, { cause: error });
      }
    };
    const locked = async () => {
      if (!file.lockPath) return run();
      try {
        return await withFileLock(file.lockPath, run);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('precondition_failed', `${harness.name} 正在写入 ${file.path}，请稍后重试`, {
          cause: error,
        });
      }
    };
    const previous = this.queues.get(file.path) ?? Promise.resolve();
    const current = previous.then(locked, locked);
    this.queues.set(
      file.path,
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

  /** Where the harness's config is, for display; its home directory when the files cannot be determined. */
  private async configLocation(harness: HarnessDescriptor) {
    try {
      const files = await harness.configFiles(this.environment);
      return harness.configLocation?.(files, this.environment) ?? files[0]?.path ?? harness.homeDir(this.environment);
    } catch {
      return harness.homeDir(this.environment);
    }
  }

  private applied(provider: StoredProvider) {
    return Object.entries(provider.harnesses) as [HarnessId, { key: string }][];
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
