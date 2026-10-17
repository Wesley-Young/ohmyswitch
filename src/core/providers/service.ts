import { type Logger, serviceToken } from '@fraqjs/kernel';

import { AppError } from '../errors.ts';
import type { HarnessService } from '../harnesses/service.ts';
import type { HttpService } from '../http/service.ts';
import type { ModelsDevService } from '../models-dev/service.ts';
import type { ModelInfo, StoredProvider } from '../provider.ts';
import type { StoreService } from '../store/service.ts';
import { fetchModelCatalog } from './model-catalog.ts';
import type { CreateProviderInput, SetModelsInput, UpdateProviderInput } from './schemas.ts';

import { randomUUID } from 'node:crypto';

export interface ProviderDeps {
  store: StoreService;
  harnesses: HarnessService;
  http: HttpService;
  modelsDev: ModelsDevService;
  logger: Logger;
}

export class ProviderService {
  static readonly token = serviceToken<ProviderService>('ohmyswitch/providers');
  private readonly deps: ProviderDeps;

  constructor(deps: ProviderDeps) {
    this.deps = deps;
  }

  list() {
    return this.deps.store.data.providers.map((provider) => this.summary(provider));
  }

  /** The detail view of a provider, with its models. */
  get(providerId: string) {
    const provider = this.find(this.deps.store.data.providers, providerId);
    return { ...this.summary(provider), models: provider.models };
  }

  /** The connection fields for the editor, the only place the API key is returned. */
  connection(providerId: string) {
    const { name, baseUrl, apiKey, endpoint } = this.find(this.deps.store.data.providers, providerId);
    return { name, baseUrl, apiKey, endpoint };
  }

  /**
   * Ask the provider which models it serves, using its saved connection, then fill missing metadata from
   * models.dev. Nothing is stored: the user picks which models to keep. models.dev failing does not fail the
   * request; it is reported alongside.
   */
  async fetchModels(providerId: string): Promise<{ models: ModelInfo[]; metadataError?: string }> {
    const provider = this.find(this.deps.store.data.providers, providerId);
    const { models } = await fetchModelCatalog(provider, this.deps.http.fetch, AbortSignal.timeout(20_000));
    try {
      const index = await this.deps.modelsDev.index();
      return { models: models.map((model) => index.enrich(model)) };
    } catch (error) {
      this.deps.logger.warn('Failed to load models.dev', error);
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
    const index = await this.deps.modelsDev.index();
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
    await this.deps.store.update((draft) => {
      if (draft.providers.some((item) => item.name === provider.name)) {
        throw new AppError('conflict', `已有名为「${provider.name}」的供应商`);
      }
      draft.providers.push(provider);
    });
    return this.summary(provider);
  }

  /** Delete the provider, removing it from every harness it is applied to first. */
  async delete(providerId: string) {
    await this.deps.harnesses.removeProvider(this.find(this.deps.store.data.providers, providerId));
    await this.deps.store.update((draft) => {
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
    const saved = await this.deps.store.update((draft) => {
      const provider = this.find(draft.providers, providerId);
      change(provider, draft.providers);
      return provider;
    });
    const harnessFailures = await this.deps.harnesses.syncProvider(saved);
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
      harnesses: this.deps.harnesses.appliedTo(provider),
      createdAt: provider.createdAt,
    };
  }

  private find<T extends StoredProvider>(providers: readonly T[], providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) throw new AppError('not_found', '供应商不存在或已删除');
    return provider;
  }
}
