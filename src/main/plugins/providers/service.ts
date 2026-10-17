import { serviceToken } from '@fraqjs/kernel';

import { AppError } from '../../../core/errors.ts';
import { type CatalogFetch, fetchModelCatalog } from '../../../core/model-catalog.ts';
import type { StoredProvider } from '../../../core/provider.ts';
import type { StoreService } from '../store/service.ts';
import type { CreateProviderInput, ProviderSourceInput, UpdateProviderInput } from './schemas.ts';

import { randomUUID } from 'node:crypto';

/** The list view of a provider; the API key is left out because lists never show it. */
function summary(provider: StoredProvider) {
  return {
    id: provider.id,
    name: provider.name,
    accessPoints: provider.accessPoints,
    endpoint: provider.endpoint,
    modelCount: provider.models.length,
    createdAt: provider.createdAt,
  };
}

export class ProviderService {
  static readonly token = serviceToken<ProviderService>('ohmyswitch/providers');
  private readonly store: StoreService;
  private readonly fetch: CatalogFetch;

  constructor(store: StoreService, fetch: CatalogFetch) {
    this.store = store;
    this.fetch = fetch;
  }

  list() {
    return this.store.data.providers.map(summary);
  }

  /** The editable view of a provider, including the API key so the edit page can show it. */
  get(providerId: string) {
    const provider = this.find(this.store.data.providers, providerId);
    return { ...summary(provider), apiKey: provider.apiKey, models: provider.models };
  }

  /** Ask the provider which models it serves. Works on unsaved form values, so nothing is stored. */
  async fetchModels(input: ProviderSourceInput) {
    const { models } = await fetchModelCatalog(input, this.fetch, AbortSignal.timeout(20_000));
    return models;
  }

  async update(input: UpdateProviderInput) {
    return this.store.update((draft) => {
      const provider = this.find(draft.providers, input.providerId);
      if (draft.providers.some((item) => item.id !== provider.id && item.name === input.name)) {
        throw new AppError('conflict', `已有名为「${input.name}」的供应商`);
      }
      provider.name = input.name;
      provider.apiKey = input.apiKey;
      provider.endpoint = input.endpoint;
      provider.models = input.models;
      // The form edits the first access point; any others are kept as they are.
      const [first, ...rest] = provider.accessPoints;
      provider.accessPoints = [{ ...(first ?? { id: 'default', label: '默认' }), baseUrl: input.baseUrl }, ...rest];
      return summary(provider);
    });
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
      accessPoints: [{ id: 'default', label: '默认', baseUrl: input.baseUrl }],
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      models: input.models,
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

  async delete(providerId: string) {
    await this.store.update((draft) => {
      const index = draft.providers.findIndex((item) => item.id === providerId);
      if (index < 0) throw new AppError('not_found', '供应商不存在或已删除');
      draft.providers.splice(index, 1);
    });
  }
}
