import { type Logger, serviceToken } from '@fraqjs/kernel';

import { AppError } from '../../../core/errors.ts';
import { type CatalogFetch, fetchModelCatalog } from '../../../core/model-catalog.ts';
import type { ModelInfo, StoredProvider } from '../../../core/provider.ts';
import type { HarnessService } from '../harnesses/service.ts';
import type { ModelsDevService } from '../models-dev/service.ts';
import type { StoreService } from '../store/service.ts';
import type { CreateProviderInput, SetModelsInput, UpdateProviderInput } from './schemas.ts';

import { randomUUID } from 'node:crypto';

/** The list view of a provider; the API key is left out because only the connection editor shows it. */
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
  private readonly modelsDev: ModelsDevService;
  private readonly logger: Logger;

  constructor(
    store: StoreService,
    harnesses: HarnessService,
    fetch: CatalogFetch,
    modelsDev: ModelsDevService,
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

  /** The detail view of a provider, with its models. */
  get(providerId: string) {
    const provider = this.find(this.store.data.providers, providerId);
    return { ...summary(provider), models: provider.models };
  }

  /** The connection fields for the editor, the only place the API key is returned. */
  connection(providerId: string) {
    const { name, baseUrl, apiKey, endpoint } = this.find(this.store.data.providers, providerId);
    return { name, baseUrl, apiKey, endpoint };
  }

  /**
   * Ask the provider which models it serves, using its saved connection, then fill missing metadata from
   * models.dev. Nothing is stored: the user picks which models to keep. models.dev failing does not fail the
   * request; it is reported alongside.
   */
  async fetchModels(providerId: string): Promise<{ models: ModelInfo[]; metadataError?: string }> {
    const provider = this.find(this.store.data.providers, providerId);
    const { models } = await fetchModelCatalog(provider, this.fetch, AbortSignal.timeout(20_000));
    try {
      const index = await this.modelsDev.index();
      return { models: models.map((model) => index.enrich(model)) };
    } catch (error) {
      this.logger.warn('Failed to load models.dev', error);
      return { models, metadataError: error instanceof AppError ? error.message : '无法读取 models.dev' };
    }
  }

  /** Replace the provider's model list and rewrite it in the harnesses it is applied to. */
  setModels(input: SetModelsInput) {
    return this.save(input.providerId, (provider) => {
      provider.models = input.models;
    });
  }

  /**
   * Overwrite model metadata with models.dev values where it has them, save, and rewrite the harnesses. Unlike
   * the fill after fetching, this is an explicit request, so models.dev failing is an error.
   */
  async syncModels(providerId: string) {
    const index = await this.modelsDev.index();
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
      provider.name = input.name;
      provider.baseUrl = input.baseUrl;
      provider.apiKey = input.apiKey;
      provider.endpoint = input.endpoint;
    });
  }

  async create(input: CreateProviderInput) {
    const provider: StoredProvider = {
      id: randomUUID(),
      name: input.name,
      baseUrl: input.baseUrl,
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      models: [],
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

  /**
   * Change a provider, then rewrite it in every harness it is applied to. Harness failures do not undo the save;
   * they are returned so the user can see which configs are out of date.
   */
  private async save(
    providerId: string,
    change: (provider: StoredProvider, providers: readonly StoredProvider[]) => void,
  ) {
    const saved = await this.store.update((draft) => {
      const provider = this.find(draft.providers, providerId);
      change(provider, draft.providers);
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
}
