// include 1.1.1 does not export `PatchIndex` and `entryListSchema`; a pnpm patch adds them. Drop the patch once
// upstream exports them.
import { entryListSchema, Include, PatchIndex, type PatchOptions } from '@cordisjs/plugin-include';
import type { EntryOptions } from '@cordisjs/plugin-loader';
import { type Context, type Fiber, type Logger, type Plugin, Service } from 'cordis';
import { load } from 'js-yaml';

import { FiberState } from '#core/cordis.ts';
import { AppError } from '#core/errors.ts';
import { readTextIfExists } from '#core/files.ts';

import { EventEmitter, on } from 'node:events';
import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

declare module 'cordis' {
  interface Context {
    plugins: PluginService;
  }
}

/** A plugin built into ohmyswitch. `plugins.yml` lists every one of them, enabled unless it says otherwise. */
export interface ManagedPlugin extends Plugin.Object<void> {
  /** How entries refer to the plugin, after `cordis:`. */
  name: string;
  /** The id of the plugin's entry. */
  id: string;
  /** The plugin's name in the plugin list. */
  title: string;
}

export interface PluginOptions {
  /** `plugins.yml`: the entry list. ohmyswitch maintains it through the loader, which writes changes back. */
  path: string;
  /** `plugins.patch.yml`: patches over the entry list, written by the user or an agent. ohmyswitch only reads it. */
  patchPath: string;
  builtins: readonly ManagedPlugin[];
}

export type PluginState = 'active' | 'pending' | 'loading' | 'failed' | 'disabled';

const builtinPrefix = 'cordis:';
/** Editors and agents may write a file in several steps; changes are applied once it has been quiet this long. */
const reloadDelayMs = 100;

const entryOf = (plugin: ManagedPlugin) => ({ id: plugin.id, name: builtinPrefix + plugin.name });

/**
 * The managed plugins, composed like a DeepSeek Harness profile with its `cordis.yml` and `cordis.patch.yml`: an
 * Include mounts `plugins.yml` and applies `plugins.patch.yml` over it with the loader's own patch semantics.
 * Enabling and disabling here goes through the loader, which writes `plugins.yml` back; a switch that a patch
 * decides cannot be changed here. Both files are applied as soon as they are saved. Only built-in plugins can be
 * loaded. The format is `docs/plugins.md`.
 */
export class PluginService extends Service {
  static readonly inject = ['loader'];
  private readonly options: PluginOptions;
  private readonly builtins: ReadonlyMap<string, ManagedPlugin>;
  private readonly logger: Logger;
  private readonly emitter = new EventEmitter();
  private notifying = false;
  /** The Include that mounts the entries, once both files could be read, and its fiber. */
  private tree: Include | undefined;
  private treeFiber: Fiber | undefined;
  private mounting: Promise<void> | undefined;
  /** The patches of `plugins.patch.yml` last read successfully. */
  private patches: PatchOptions[] = [];
  /** Why each file is not applied, while it cannot be read. */
  private fileError: string | undefined;
  private patchError: string | undefined;

  constructor(ctx: Context, options: PluginOptions) {
    super(ctx, 'plugins');
    this.options = options;
    this.builtins = new Map(options.builtins.map((plugin) => [plugin.name, plugin]));
    this.logger = ctx.logger('plugins');
    ctx.on('internal/status', (fiber) => {
      if (this.owns(fiber)) this.changed();
    });
  }

  async *[Service.init]() {
    await mkdir(dirname(this.options.path), { recursive: true, mode: 0o700 });
    await this.readPatches();
    this.fileError = errorOf(await this.readEntries());
    // With either file unreadable, start without plugins rather than guess: a harness the user disabled would come
    // back. The plugins load once the files have been fixed.
    if (!this.fileError && !this.patchError) await this.mount();
    yield this.watch();
  }

  /** Every entry, sorted by name like the harnesses they provide. */
  async list() {
    const entries = await Promise.all((this.tree?.root.data ?? []).map((options) => this.describe(options)));
    return {
      path: this.options.path,
      patchPath: this.options.patchPath,
      fileError: this.fileError ?? null,
      patchError: this.patchError ?? null,
      entries: entries.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
    };
  }

  /** Enable or disable an entry through the loader, which writes `plugins.yml` back. */
  async setEnabled(id: string, enabled: boolean) {
    const tree = this.find(id);
    if (this.fileError) throw new AppError('precondition_failed', 'plugins.yml 有错误，修正后才能启用或停用插件');
    if (this.patchError) {
      throw new AppError('precondition_failed', 'plugins.patch.yml 有错误，修正后才能启用或停用插件');
    }
    if (!this.switchable(id)) {
      throw new AppError('precondition_failed', '这个插件是否启用由 plugins.patch.yml 决定，请在其中修改');
    }
    await tree.update(id, { disabled: enabled ? null : true });
    await tree.flush();
    this.changed();
  }

  /** Fires whenever the list or the state of a plugin may have changed. */
  async *events(signal: AbortSignal): AsyncGenerator<void> {
    try {
      for await (const _ of on(this.emitter, 'change', { signal })) yield;
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }

  private mount() {
    this.mounting ??= this.mountTree().finally(() => {
      this.mounting = undefined;
    });
    return this.mounting;
  }

  private async mountTree() {
    if (this.tree) return;
    const service = this;
    class PluginTree extends Include {
      constructor(ctx: Context, config: Include.Config) {
        super(ctx, config);
        service.tree = this;
      }

      /** Only built-in plugins load; neither file can make ohmyswitch import arbitrary modules. */
      override import(name: string) {
        const plugin = service.builtin(name);
        if (!plugin) throw new Error(`Unknown plugin "${name}"`);
        return plugin;
      }
    }
    this.treeFiber = await this.ctx.plugin(PluginTree, {
      path: pathToFileURL(this.options.path).href,
      initial: [...this.builtins.values()].map(entryOf),
      patches: this.patches,
    });
    await this.addMissing();
    this.changed();
  }

  /** `plugins.yml` changed: apply it, or load the plugins if it was what kept them from loading. */
  private async reloadEntries() {
    this.fileError = errorOf(await this.readEntries());
    if (this.tree) await this.tree.refresh();
    else if (!this.fileError && !this.patchError) await this.mount();
    this.changed();
  }

  /** `plugins.patch.yml` changed: apply the new patches in place, keeping entries whose options did not change. */
  private async reloadPatches() {
    await this.readPatches();
    if (!this.patchError) {
      if (this.tree && this.treeFiber) {
        await this.treeFiber.update({ ...this.tree.config, patches: this.patches }, true);
      } else if (!this.fileError) {
        await this.mount();
      }
    }
    this.changed();
  }

  private async readPatches() {
    const result = await readList<PatchOptions>(this.options.patchPath);
    if ('error' in result) this.logger.warn('Cannot read %s: %s', this.options.patchPath, result.error);
    else this.patches = result.list;
    this.patchError = errorOf(result);
  }

  /** The entries in `plugins.yml` as written, before patches. The loader reads the file again for itself. */
  private async readEntries() {
    const result = await readList<EntryOptions>(this.options.path);
    if ('error' in result) this.logger.warn('Cannot read %s: %s', this.options.path, result.error);
    return result;
  }

  /**
   * Built-in plugins `plugins.yml` does not list are added to it, so plugins that come with a new version show up.
   * A plugin is turned off with `disabled: true`; one whose entry was deleted comes back.
   */
  private async addMissing() {
    const tree = this.tree;
    const result = await this.readEntries();
    if (!tree || 'error' in result) return;
    const named = new Set(result.list.map((options) => options.name));
    for (const plugin of this.builtins.values()) {
      const { id, name } = entryOf(plugin);
      if (named.has(name)) continue;
      const options: Omit<EntryOptions, 'id'> = { name };
      // An entry may already use the id for something else; the loader then picks a new one.
      if (!tree.store[id]) Object.assign(options, { id });
      await tree.create(options, null);
    }
    await tree.flush();
  }

  /** Whether `disabled` of an entry belongs to `plugins.yml`, rather than to a patch that decides it. */
  private switchable(id: string) {
    return new PatchIndex(this.tree?.config.patches ?? []).fileOwned(id, 'disabled');
  }

  private builtin(name: string) {
    return name.startsWith(builtinPrefix) ? this.builtins.get(name.slice(builtinPrefix.length)) : undefined;
  }

  private async describe(options: EntryOptions) {
    const builtin = this.builtin(options.name);
    const entry = this.tree?.store[options.id];
    const enabled = !(entry ? entry.disabled : options.disabled);
    const status = await this.statusOf(enabled, builtin, entry?.fiber);
    return {
      id: options.id,
      name: options.name,
      /** The built-in plugin the entry loads, or null when there is no such plugin. */
      pluginId: builtin?.id ?? null,
      title: builtin?.title ?? options.name,
      enabled,
      /** Whether `plugins.patch.yml` decides if the entry is enabled, so it cannot be switched here. */
      locked: !this.switchable(options.id),
      ...status,
    };
  }

  private async statusOf(
    enabled: boolean,
    builtin: ManagedPlugin | undefined,
    fiber: Fiber | undefined,
  ): Promise<{ state: PluginState; error: string | null }> {
    if (!enabled) return { state: 'disabled', error: null };
    if (!builtin) return { state: 'failed', error: '没有这个插件' };
    switch (fiber?.state) {
      case FiberState.ACTIVE:
        return { state: 'active', error: null };
      case FiberState.PENDING:
        return { state: 'pending', error: null };
      case FiberState.FAILED: {
        const error = await fiber.await().then(
          () => null,
          (reason: unknown) => (reason instanceof AppError ? reason.message : '插件启动失败'),
        );
        return { state: 'failed', error };
      }
      default:
        return { state: 'loading', error: null };
    }
  }

  private find(id: string) {
    const tree = this.tree;
    const entry = tree?.store[id];
    if (!tree || !entry || entry.parent !== tree.root) throw new AppError('not_found', '插件不存在或已被移除');
    return tree;
  }

  /** Whether a fiber is the plugin of one of the entries, rather than something that plugin started. */
  private owns(fiber: Fiber) {
    const entry = fiber.entry;
    return entry !== undefined && entry.parent.tree === this.tree && fiber.parent.fiber?.entry !== entry;
  }

  /** Watches both files. Directories are watched because writers replace files by renaming them. */
  private watch() {
    const handlers = new Map([
      [this.options.path, () => this.reloadEntries()],
      [this.options.patchPath, () => this.reloadPatches()],
    ]);
    const timers = new Map<string, NodeJS.Timeout>();
    const watchers = [...new Set([...handlers.keys()].map((path) => dirname(path)))].map((dir) => {
      const watcher = watch(dir, (_event, name) => {
        const path = [...handlers.keys()].find((file) => dirname(file) === dir && basename(file) === name);
        const handler = path && handlers.get(path);
        if (!path || !handler) return;
        clearTimeout(timers.get(path));
        const timer = setTimeout(() => {
          handler().catch((error: unknown) => this.logger.warn('Failed to apply %s', path, error));
        }, reloadDelayMs);
        timers.set(path, timer);
      });
      watcher.on('error', (error) => this.logger.warn('Stopped watching %s', dir, error));
      return watcher;
    });
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    };
  }

  /** Several changes in one turn are reported once. */
  private changed() {
    if (this.notifying) return;
    this.notifying = true;
    queueMicrotask(() => {
      this.notifying = false;
      this.emitter.emit('change');
    });
  }
}

type ListResult<T> = { list: T[] } | { error: string };

const errorOf = (result: ListResult<unknown>) => ('error' in result ? result.error : undefined);

/**
 * An entry list or patch list as the loader reads it (its YAML dialect, a top-level list of mappings), or why it
 * cannot be used. A missing or empty file is an empty list.
 */
async function readList<T>(path: string): Promise<ListResult<T>> {
  let value: unknown;
  try {
    const text = await readTextIfExists(path);
    if (!text?.trim()) return { list: [] };
    value = load(text, { schema: entryListSchema });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  if (!Array.isArray(value)) return { error: 'The file must be a list' };
  const index = value.findIndex((item) => typeof item !== 'object' || item === null || Array.isArray(item));
  if (index >= 0) return { error: `Item ${index + 1} must be a mapping` };
  return { list: value };
}
