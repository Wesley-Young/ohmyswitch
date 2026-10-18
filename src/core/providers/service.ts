import { type Context, type Logger, Service } from 'cordis';

import { AppError } from '#core/errors.ts';
import type { HarnessFailure } from '#core/harnesses/service.ts';
import type {} from '#core/http/service.ts';
import type {} from '#core/icons/service.ts';
import type {} from '#core/models-dev/service.ts';
import type { ModelInfo, StoredProvider } from '#core/provider.ts';
import type {} from '#core/store/service.ts';
import { candidateId, groupImports, type ImportCandidate, uniqueName, withImportedModels } from './harness-import.ts';
import { fetchModelCatalog } from './model-catalog.ts';
import type {
  CreateProviderInput,
  ImportFromHarnessesInput,
  ReorderInput,
  ReviewModelsInput,
  SetModelsInput,
  UpdateProviderInput,
} from './schemas.ts';

import { randomUUID } from 'node:crypto';

declare module 'cordis' {
  interface Context {
    providers: ProviderService;
  }
}

export class ProviderService extends Service {
  static readonly inject = ['store', 'harnesses', 'http', 'modelsDev', 'icons'];
  private readonly logger: Logger;

  constructor(ctx: Context) {
    super(ctx, 'providers');
    this.logger = ctx.logger('providers');
  }

  list() {
    return this.ctx.store.data.providers.map((provider) => this.summary(provider));
  }

  /** The detail view of a provider, with its models. */
  get(providerId: string) {
    const provider = this.find(this.ctx.store.data.providers, providerId);
    return { ...this.summary(provider), models: provider.models, listedModels: provider.listedModels };
  }

  /** The connection fields for the editor, the only place the API key is returned. */
  connection(providerId: string) {
    const { name, baseUrl, apiKey, endpoint, iconUrl } = this.find(this.ctx.store.data.providers, providerId);
    return { name, baseUrl, apiKey, endpoint, iconUrl: iconUrl ?? '' };
  }

  /**
   * Ask the provider which models it serves, using its saved connection, then fill missing metadata from
   * models.dev. The user picks which models to keep, so only the list itself is recorded as reviewed. models.dev
   * failing does not fail the request; it is reported alongside.
   */
  async fetchModels(providerId: string): Promise<{ models: ModelInfo[]; metadataError?: string }> {
    const result = await this.remote(providerId);
    await this.recordListed(providerId, result.models);
    return result;
  }

  /**
   * The provider's model list, for comparing with the saved models in the background. The first time, it is only
   * recorded, so models that were already there are not offered as new. A failure of models.dev is not reported.
   */
  async remoteModels(providerId: string): Promise<{ models: ModelInfo[] }> {
    const { models } = await this.remote(providerId);
    if (!this.find(this.ctx.store.data.providers, providerId).listedModels) await this.recordListed(providerId, models);
    return { models };
  }

  /** Replace the provider's model list and rewrite it in the harnesses it is applied to. */
  setModels(input: SetModelsInput) {
    return this.save(input.providerId, (provider) => {
      provider.models = input.models;
    });
  }

  /**
   * Apply the review of how the provider's model list changed, and remember the list as reviewed. The harnesses
   * are rewritten only when models were added or removed.
   */
  async reviewModels(input: ReviewModelsInput) {
    if (!input.add.length && !input.remove.length) {
      const saved = await this.ctx.store.update((draft) => {
        const provider = this.find(draft.providers, input.providerId);
        provider.listedModels = input.listed;
        return provider;
      });
      return { ...this.summary(saved), harnessFailures: [] as HarnessFailure[] };
    }
    return this.save(input.providerId, (provider) => {
      const removed = new Set(input.remove);
      const kept = provider.models.filter((model) => !removed.has(model.id));
      const known = new Set(kept.map((model) => model.id));
      provider.models = [...kept, ...input.add.filter((model) => !known.has(model.id))].sort((a, b) =>
        a.id.localeCompare(b.id),
      );
      provider.listedModels = input.listed;
    });
  }

  /**
   * What could be imported from the harness configs, grouped into providers, and the harnesses that could not be
   * read. API keys stay here; they are read again when importing.
   */
  async harnessImports() {
    const { sources, failures } = await this.ctx.harnesses.importSources();
    const candidates = groupImports(sources, this.ctx.store.data.providers).map((candidate) => ({
      id: candidateId(candidate.sources),
      sources: candidate.sources,
      name: candidate.name,
      baseUrl: candidate.connection?.baseUrl,
      endpoint: candidate.connection?.endpoint,
      modelCount: candidate.models.length,
      target: candidate.target,
      reason: candidate.reason,
    }));
    return { candidates, failures };
  }

  /**
   * Import the chosen candidates: each becomes a provider, or joins the existing one with the same connection, and
   * takes over its entries, which are then rewritten the way ohmyswitch writes them. The configs are read again;
   * if a chosen candidate changed meanwhile, nothing is imported. Harness failures do not undo the import.
   */
  async importFromHarnesses(input: ImportFromHarnessesInput) {
    const { sources } = await this.ctx.harnesses.importSources();
    const found = new Map(
      groupImports(sources, this.ctx.store.data.providers).map((candidate) => [
        candidateId(candidate.sources),
        candidate,
      ]),
    );
    const chosen = input.candidates.map(({ sources }) => found.get(candidateId(sources)));
    const changed = () => new AppError('conflict', 'Harness 的配置刚被修改，请重新选择');
    if (chosen.some((candidate) => !candidate?.connection || candidate.reason)) throw changed();
    const enrich = await this.enricher();
    const ids = await this.ctx.store.update((draft) => {
      const names = new Set(draft.providers.map((provider) => provider.name));
      return (chosen as ImportCandidate[]).map((candidate) => {
        const connection = candidate.connection as NonNullable<ImportCandidate['connection']>;
        const applications = Object.fromEntries(
          candidate.sources.map((source) => [source.harnessId, { key: source.key }]),
        );
        const models = candidate.models.map(enrich);
        if (candidate.target) {
          const target = draft.providers.find((provider) => provider.id === candidate.target?.providerId);
          if (!target) throw changed();
          Object.assign(target.harnesses, applications);
          target.models = withImportedModels(target.models, models);
          return target.id;
        }
        const name = uniqueName(candidate.name, names);
        names.add(name);
        const provider: StoredProvider = {
          id: randomUUID(),
          name,
          ...connection,
          models,
          harnesses: applications,
          createdAt: new Date().toISOString(),
        };
        draft.providers.push(provider);
        return provider.id;
      });
    });
    const failures = new Map<string, HarnessFailure>();
    for (const id of new Set(ids)) {
      const provider = this.find(this.ctx.store.data.providers, id);
      for (const failure of await this.ctx.harnesses.syncProvider(provider)) {
        if (!failures.has(failure.harnessId)) failures.set(failure.harnessId, failure);
      }
    }
    return {
      providers: [...new Set(ids)].map((id) => this.summary(this.find(this.ctx.store.data.providers, id))),
      harnessFailures: [...failures.values()],
    };
  }

  /**
   * Overwrite model metadata with models.dev values where it has them, save, and rewrite the harnesses. Unlike
   * the fill after fetching, this is an explicit request, so models.dev failing is an error.
   */
  async syncModels(providerId: string) {
    const index = await this.ctx.modelsDev.index();
    let unmatched = 0;
    const result = await this.save(providerId, (provider) => {
      const results = provider.models.map((model) => index.sync(model));
      unmatched = results.filter((item) => !item.matched).length;
      provider.models = results.map((item) => item.model);
    });
    return { ...result, unmatched };
  }

  /** Save the connection fields and rewrite the harnesses the provider is applied to. */
  update(input: UpdateProviderInput) {
    return this.save(input.providerId, (provider, providers) => {
      if (providers.some((item) => item.id !== provider.id && item.name === input.name)) {
        throw new AppError('conflict', `已有名为「${input.name}」的供应商`);
      }
      // Another address or protocol lists other models; the next read of the list starts over from it.
      if (provider.baseUrl !== input.baseUrl || provider.endpoint !== input.endpoint) delete provider.listedModels;
      provider.name = input.name;
      provider.baseUrl = input.baseUrl;
      provider.apiKey = input.apiKey;
      provider.endpoint = input.endpoint;
      if (input.iconUrl) provider.iconUrl = input.iconUrl;
      else delete provider.iconUrl;
    });
  }

  async create(input: CreateProviderInput) {
    const models = input.modelIds?.length ? await this.initialModels(input.modelIds) : [];
    const provider: StoredProvider = {
      id: randomUUID(),
      name: input.name,
      baseUrl: input.baseUrl,
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      ...(input.iconUrl ? { iconUrl: input.iconUrl } : {}),
      models,
      harnesses: {},
      createdAt: new Date().toISOString(),
    };
    await this.ctx.store.update((draft) => {
      if (draft.providers.some((item) => item.name === provider.name)) {
        throw new AppError('conflict', `已有名为「${provider.name}」的供应商`);
      }
      draft.providers.push(provider);
    });
    return this.summary(provider);
  }

  /**
   * Save the order of the provider list, then put ohmyswitch's entries in every harness in the same order. The ids
   * must be exactly the current providers; a list that changed meanwhile is rejected so nothing is lost. Harness
   * failures do not undo the save.
   */
  async reorder(input: ReorderInput) {
    await this.ctx.store.update((draft) => {
      const byId = new Map(draft.providers.map((provider) => [provider.id, provider]));
      if (input.providerIds.length !== byId.size || input.providerIds.some((id) => !byId.has(id))) {
        throw new AppError('conflict', '供应商列表已变化，请重试');
      }
      draft.providers = input.providerIds.map((id) => byId.get(id) as StoredProvider);
    });
    return { harnessFailures: await this.ctx.harnesses.reorder() };
  }

  /** Delete the provider, removing it from every harness it is applied to first. */
  async delete(providerId: string) {
    await this.ctx.harnesses.removeProvider(this.find(this.ctx.store.data.providers, providerId));
    await this.ctx.store.update((draft) => {
      const index = draft.providers.findIndex((item) => item.id === providerId);
      if (index < 0) throw new AppError('not_found', '供应商不存在或已删除');
      draft.providers.splice(index, 1);
    });
    await this.ctx.icons.forget(providerId);
  }

  /** Models from their ids, with metadata from models.dev where it is available; without it, ids alone. */
  private async initialModels(ids: string[]): Promise<ModelInfo[]> {
    return ids.map((id) => ({ id })).map(await this.enricher());
  }

  /** Fills a model's missing metadata from models.dev; without models.dev, models are left as they are. */
  private async enricher(): Promise<(model: ModelInfo) => ModelInfo> {
    try {
      const index = await this.ctx.modelsDev.index();
      return (model) => index.enrich(model);
    } catch (error) {
      this.logger.warn('Failed to load models.dev', error);
      return (model) => model;
    }
  }

  /** The models the provider lists now, with metadata from models.dev where it is available. */
  private async remote(providerId: string): Promise<{ models: ModelInfo[]; metadataError?: string }> {
    const provider = this.find(this.ctx.store.data.providers, providerId);
    const { models } = await fetchModelCatalog(provider, this.ctx.http.fetch, AbortSignal.timeout(20_000));
    try {
      const index = await this.ctx.modelsDev.index();
      return { models: models.map((model) => index.enrich(model)) };
    } catch (error) {
      this.logger.warn('Failed to load models.dev', error);
      return { models, metadataError: error instanceof AppError ? error.message : '无法读取 models.dev' };
    }
  }

  /** Remember the provider's model list as reviewed. A provider deleted meanwhile is skipped. */
  private recordListed(providerId: string, models: readonly ModelInfo[]) {
    return this.ctx.store.update((draft) => {
      const provider = draft.providers.find((item) => item.id === providerId);
      if (provider) provider.listedModels = models.map((model) => model.id);
    });
  }

  /**
   * Change a provider, then rewrite it in every harness it is applied to. Harness failures do not undo the save;
   * they are returned so the user can see which configs are out of date.
   */
  private async save(
    providerId: string,
    change: (provider: StoredProvider, providers: readonly StoredProvider[]) => void,
  ) {
    const saved = await this.ctx.store.update((draft) => {
      const provider = this.find(draft.providers, providerId);
      change(provider, draft.providers);
      return provider;
    });
    const harnessFailures = await this.ctx.harnesses.syncProvider(saved);
    return { ...this.summary(saved), harnessFailures };
  }

  /**
   * The list view of a provider; the API key is left out because only the connection editor shows it. Only
   * registered harnesses are listed, since nothing can be done with the others.
   */
  private summary(provider: StoredProvider) {
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      endpoint: provider.endpoint,
      modelCount: provider.models.length,
      harnesses: this.ctx.harnesses.appliedTo(provider),
      createdAt: provider.createdAt,
    };
  }

  private find<T extends StoredProvider>(providers: readonly T[], providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) throw new AppError('not_found', '供应商不存在或已删除');
    return provider;
  }
}
