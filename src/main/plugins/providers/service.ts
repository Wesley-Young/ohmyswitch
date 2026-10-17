import { type Logger, serviceToken } from '@fraqjs/kernel';

import { AppError } from '../../../core/errors.ts';
import { type CatalogFetch, fetchModelCatalog } from '../../../core/model-catalog.ts';
import type { ModelInfo, StoredProvider } from '../../../core/provider.ts';
import type { HarnessService } from '../harnesses/service.ts';
import type { StoreService } from '../store/service.ts';
import type { ModelsDevCatalog } from './models-dev.ts';
import type { CreateProviderInput, ProviderSourceInput, SyncModelsInput, UpdateProviderInput } from './schemas.ts';

import { randomUUID } from 'node:crypto';

/** The list view of a provider; the API key is left out because lists never show it. */
function summary(provider: StoredProvider) {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    endpoint: provider.endpoint,
    modelCount: provider.models.length,
    harnesses: Object.keys(provider.harnesses) as (keyof StoredProvider['harnesses'])[],
    createdAt: provider.createdAt,
  };
}

export class ProviderService {
  static readonly token = serviceToken<ProviderService>('ohmyswitch/providers');
  private readonly store: StoreService;
  private readonly harnesses: HarnessService;
  private readonly fetch: CatalogFetch;
  private readonly modelsDev: ModelsDevCatalog;
  private readonly logger: Logger;

  constructor(
    store: StoreService,
    harnesses: HarnessService,
    fetch: CatalogFetch,
    modelsDev: ModelsDevCatalog,
    logger: Logger,
  ) {
    this.store = store;
    this.harnesses = harnesses;
    this.fetch = fetch;
    this.modelsDev = modelsDev;
    this.logger = logger;
  }

  list() {
    return this.store.data.providers.map(summary);
  }

  /** The editable view of a provider, including the API key so the edit page can show it. */
  get(providerId: string) {
    const provider = this.find(this.store.data.providers, providerId);
    return { ...summary(provider), apiKey: provider.apiKey, models: provider.models };
  }

  /**
   * Ask the provider which models it serves, then fill missing metadata from models.dev. Works on unsaved form
   * values, so nothing is stored. models.dev failing does not fail the request; it is reported alongside.
   */
  async fetchModels(input: ProviderSourceInput): Promise<{ models: ModelInfo[]; metadataError?: string }> {
    const { models } = await fetchModelCatalog(input, this.fetch, AbortSignal.timeout(20_000));
    try {
      const index = await this.modelsDev.index();
      return { models: models.map((model) => index.enrich(model)) };
    } catch (error) {
      this.logger.warn('Failed to load models.dev', error);
      return {
        models,
        metadataError: error instanceof AppError ? error.message : '无法读取 models.dev',
      };
    }
  }

  /**
   * Overwrite model metadata with models.dev values where it has them. Works on unsaved form values, so nothing
   * is stored. Unlike the fill after fetching, this is an explicit request and models.dev failing is an error.
   */
  async syncModels(input: SyncModelsInput) {
    const index = await this.modelsDev.index();
    const results = input.models.map((model) => index.sync(model));
    return {
      models: results.map((result) => result.model),
      unmatched: results.filter((result) => !result.matched).length,
    };
  }

  /**
   * Save the provider, then rewrite it in every harness it is applied to. Harness failures do not undo the save;
   * they are returned so the user can see which configs are out of date.
   */
  async update(input: UpdateProviderInput) {
    const saved = await this.store.update((draft) => {
      const provider = this.find(draft.providers, input.providerId);
      if (draft.providers.some((item) => item.id !== provider.id && item.name === input.name)) {
        throw new AppError('conflict', `已有名为「${input.name}」的供应商`);
      }
      provider.name = input.name;
      provider.apiKey = input.apiKey;
      provider.endpoint = input.endpoint;
      provider.models = input.models;
      provider.baseUrl = input.baseUrl;
      return provider;
    });
    const harnessFailures = await this.harnesses.syncProvider(saved);
    return { ...summary(saved), harnessFailures };
  }

  private find<T extends StoredProvider>(providers: readonly T[], providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) throw new AppError('not_found', '供应商不存在或已删除');
    return provider;
  }

  async create(input: CreateProviderInput) {
    const provider: StoredProvider = {
      id: randomUUID(),
      name: input.name,
      baseUrl: input.baseUrl,
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      models: input.models,
      harnesses: {},
      createdAt: new Date().toISOString(),
    };
    await this.store.update((draft) => {
      if (draft.providers.some((item) => item.name === provider.name)) {
        throw new AppError('conflict', `已有名为「${provider.name}」的供应商`);
      }
      draft.providers.push(provider);
    });
    return summary(provider);
  }

  /** Delete the provider, removing it from every harness it is applied to first. */
  async delete(providerId: string) {
    await this.harnesses.removeProvider(this.find(this.store.data.providers, providerId));
    await this.store.update((draft) => {
      const index = draft.providers.findIndex((item) => item.id === providerId);
      if (index < 0) throw new AppError('not_found', '供应商不存在或已删除');
      draft.providers.splice(index, 1);
    });
  }
}
