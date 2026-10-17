import { type Context, Service } from 'cordis';
import { z } from 'zod';

import { AppError } from '../errors.ts';
import { isDirectory } from '../files.ts';
import type {} from '../models-dev/service.ts';
import type { StoredProvider } from '../provider.ts';
import type {} from '../store/service.ts';
import { type ApplicationState, assertWritable, chooseKey, entryState, worseState } from './applications.ts';
import { ConfigEditor, readConfigText } from './editor.ts';
import {
  type HarnessConfigFile,
  type HarnessDescriptor,
  type HarnessEnvironment,
  type HarnessId,
  harnessId,
} from './types.ts';

const failureMessage = (error: unknown) => (error instanceof AppError ? error.message : '写入失败');

declare module 'cordis' {
  interface Context {
    harnesses: HarnessService;
  }
}

export const harnessOptions = z.object({
  /** Home directory used to locate harness configs. */
  home: z.string(),
  env: z.record(z.string(), z.string().optional()),
});

export type HarnessOptions = z.infer<typeof harnessOptions>;

export interface HarnessFailure {
  harnessId: HarnessId;
  message: string;
}

interface Registration {
  harness: HarnessDescriptor;
  /** Edits of this harness's files in flight, which unregistering waits for. */
  running: Set<Promise<unknown>>;
}

/**
 * The harnesses ohmyswitch can write to, registered by their plugins, and the applications of providers to them.
 * File edits go through `ConfigEditor`; this service decides what to write and records what was applied.
 */
export class HarnessService extends Service {
  static readonly inject = ['store', 'modelsDev'];
  static readonly Config = harnessOptions;
  private readonly environment: HarnessEnvironment;
  private readonly editor = new ConfigEditor();
  private readonly registrations = new Map<HarnessId, Registration>();

  constructor(ctx: Context, options: HarnessOptions) {
    super(ctx, 'harnesses');
    this.environment = options;
  }

  /**
   * Make a harness available while the calling plugin is loaded. Unregistering stops new edits of its files and
   * waits for the ones in flight.
   */
  register(harness: HarnessDescriptor) {
    if (!harnessId.safeParse(harness.id).success) throw new Error(`Invalid harness id "${harness.id}"`);
    if (this.registrations.has(harness.id)) throw new AppError('conflict', `已有另一个插件提供 ${harness.name}`);
    const registration: Registration = { harness, running: new Set() };
    return this.ctx.effect(
      () => {
        this.registrations.set(harness.id, registration);
        return async () => {
          this.registrations.delete(harness.id);
          await Promise.allSettled(registration.running);
        };
      },
      `ctx.harnesses.register(${JSON.stringify(harness.id)})`,
    );
  }

  /** Each harness, whether it is present on this machine, where its config is, and which endpoints it cannot serve. */
  list() {
    return Promise.all(
      this.harnesses().map(async (harness) => ({
        id: harness.id,
        name: harness.name,
        homepage: harness.homepage,
        detected: await isDirectory(harness.homeDir(this.environment)),
        configPath: await this.configLocation(harness),
        unsupportedEndpoints: [...(harness.unsupportedEndpoints ?? [])],
      })),
    );
  }

  /** The registered harnesses a provider is applied to. Applications of unregistered harnesses are left out. */
  appliedTo(provider: StoredProvider): HarnessId[] {
    return this.applied(provider).map(([id]) => id);
  }

  /** For every provider, the harnesses it is applied to and how each config entry looks now. */
  async applications() {
    const result: Record<string, { harnessId: HarnessId; key: string; state: ApplicationState }[]> = {};
    for (const harness of this.harnesses()) {
      const applied = this.ctx.store.data.providers.filter((provider) => provider.harnesses[harness.id]);
      if (!applied.length) continue;
      // Per file, the entries in it, or undefined when it cannot be read.
      let files: { file: HarnessConfigFile; entries: Record<string, unknown> | undefined }[] | undefined;
      try {
        files = await Promise.all(
          (await harness.configFiles(this.environment)).map(async (file) => {
            try {
              return { file, entries: file.adapter.readProviders(await readConfigText(file.path)) };
            } catch {
              return { file, entries: undefined };
            }
          }),
        );
      } catch {
        files = undefined;
      }
      for (const provider of applied) {
        const { key } = provider.harnesses[harness.id];
        const state = files
          ? files.reduce<ApplicationState>(
              (worst, { file, entries }) => worseState(worst, entryState(file, provider, key, entries)),
              'applied',
            )
          : 'unreadable';
        result[provider.id] = [...(result[provider.id] ?? []), { harnessId: harness.id, key, state }];
      }
    }
    return result;
  }

  /**
   * Write a provider into a harness's config files. The first time, a key is derived from the provider name; if a
   * file already has an entry with that key that ohmyswitch does not own, `replace` must confirm taking it over.
   */
  apply(providerId: string, harnessId: HarnessId, replace: boolean) {
    return this.track(harnessId, (harness) => this.applyTo(providerId, harness, replace));
  }

  private async applyTo(providerId: string, harness: HarnessDescriptor, replace: boolean) {
    const harnessId = harness.id;
    const provider = this.provider(providerId);
    if (!(await isDirectory(harness.homeDir(this.environment)))) {
      throw new AppError('precondition_failed', `未发现 ${harness.name}`);
    }
    if (harness.unsupportedEndpoints?.includes(provider.endpoint)) {
      throw new AppError('precondition_failed', `${harness.name} 不支持这个供应商的端点`);
    }
    const files = await harness.configFiles(this.environment);
    const key = provider.harnesses[harnessId]?.key ?? (await this.newKey(provider, harness, files, replace));
    assertWritable(files, provider, key);
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
      await this.ctx.store.update((draft) => {
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
    const failure = await this.track(harnessId, (harness) => this.remove(provider, harness));
    if (failure) throw new AppError('precondition_failed', failure.message);
    await this.ctx.store.update((draft) => {
      const target = draft.providers.find((item) => item.id === providerId);
      if (target) delete target.harnesses[harnessId];
    });
  }

  /** Rewrite a provider in every harness it is applied to, after it changed. Failures are reported, not thrown. */
  async syncProvider(provider: StoredProvider): Promise<HarnessFailure[]> {
    const failures: HarnessFailure[] = [];
    for (const [harnessId, application] of this.applied(provider)) {
      try {
        await this.track(harnessId, async (harness) => {
          const files = await harness.configFiles(this.environment);
          assertWritable(files, provider, application.key);
          for (const file of files) await this.writeEntry(harness, file, provider, application.key);
        });
      } catch (error) {
        failures.push({ harnessId, message: failureMessage(error) });
      }
    }
    return failures;
  }

  /**
   * Remove a provider from every registered harness it is applied to, before it is deleted. Throws on the first
   * failure. An unregistered harness cannot be edited, so its entry stays in that harness's config.
   */
  async removeProvider(provider: StoredProvider) {
    for (const [harnessId] of this.applied(provider)) {
      const failure = await this.track(harnessId, (harness) => this.remove(provider, harness));
      if (failure) throw new AppError('precondition_failed', failure.message);
    }
  }

  /** Remove the entry from every file, in reverse write order. Every file is tried; the first failure is reported. */
  private async remove(provider: StoredProvider, harness: HarnessDescriptor): Promise<HarnessFailure | undefined> {
    const key = provider.harnesses[harness.id]?.key;
    if (!key) return undefined;
    let failure: HarnessFailure | undefined;
    try {
      for (const file of (await harness.configFiles(this.environment)).reverse()) {
        try {
          await this.editor.edit(harness.name, file, (text) =>
            file.adapter.readProviders(text)[key] === undefined ? text : file.adapter.write(text, key, undefined),
          );
        } catch (error) {
          failure ??= { harnessId: harness.id, message: failureMessage(error) };
        }
      }
    } catch (error) {
      failure ??= { harnessId: harness.id, message: failureMessage(error) };
    }
    return failure;
  }

  /**
   * A key for a provider's first application, avoiding keys owned by other ohmyswitch providers and, for harnesses
   * built on models.dev, every catalog provider id. An existing entry with the key needs `replace`.
   */
  private async newKey(
    provider: StoredProvider,
    harness: HarnessDescriptor,
    files: readonly HarnessConfigFile[],
    replace: boolean,
  ) {
    const owned = new Set(
      this.ctx.store.data.providers.flatMap((item) =>
        item.id === provider.id ? [] : [item.harnesses[harness.id]?.key],
      ),
    );
    const catalog = files.some((file) => file.adapter.reservesCatalogProviders)
      ? await this.catalogProviderIds(harness)
      : new Set<string>();
    const contents = await Promise.all(
      files.map(async (file) => {
        const text = await readConfigText(file.path);
        return { file, text, entries: file.adapter.readProviders(text) };
      }),
    );
    const key = chooseKey(provider.name, contents, (candidate) => owned.has(candidate) || catalog.has(candidate));
    if (!replace && contents.some(({ entries }) => entries[key] !== undefined)) {
      throw new AppError('conflict', `${harness.name} 中已有「${key}」`);
    }
    return key;
  }

  private writeEntry(harness: HarnessDescriptor, file: HarnessConfigFile, provider: StoredProvider, key: string) {
    return this.editor.edit(harness.name, file, (text) =>
      file.adapter.write(text, key, file.adapter.entry(provider, file.adapter.readProviders(text)[key], key)),
    );
  }

  /** Built-in provider ids of a harness that builds on models.dev. Without the catalog, no new key is assigned. */
  private async catalogProviderIds(harness: HarnessDescriptor) {
    try {
      return (await this.ctx.modelsDev.index()).providerIds;
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

  /** Registered harnesses; the registration order is the display order. */
  private harnesses() {
    return [...this.registrations.values()].map((registration) => registration.harness);
  }

  /** The provider's applications to registered harnesses, in display order. */
  private applied(provider: StoredProvider) {
    return this.harnesses().flatMap(({ id }) => {
      const application = provider.harnesses[id];
      return application ? [[id, application] as const] : [];
    });
  }

  /** Run an edit of a registered harness's files; unregistering the harness waits for it. */
  private track<T>(harnessId: HarnessId, task: (harness: HarnessDescriptor) => Promise<T>): Promise<T> {
    const registration = this.registrations.get(harnessId);
    if (!registration) return Promise.reject(new AppError('not_found', '不支持这个 Harness'));
    const run = task(registration.harness);
    registration.running.add(run);
    void run.then(
      () => registration.running.delete(run),
      () => registration.running.delete(run),
    );
    return run;
  }

  private provider(providerId: string) {
    const provider = this.ctx.store.data.providers.find((item) => item.id === providerId);
    if (!provider) throw new AppError('not_found', '供应商不存在或已删除');
    return provider;
  }
}
