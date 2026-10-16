import { serviceToken } from '@fraqjs/kernel';

import { AppError } from '../../../core/errors.ts';
import type { StoredProvider } from '../../../core/provider.ts';
import type { StoreService } from '../store/service.ts';
import type { CreateProviderInput } from './schemas.ts';

import { randomUUID } from 'node:crypto';

/** The list view of a provider; the API key is left out because lists never show it. */
function summary(provider: StoredProvider) {
  return {
    id: provider.id,
    name: provider.name,
    accessPoints: provider.accessPoints,
    endpoints: provider.endpoints,
    modelCount: provider.models.length,
    createdAt: provider.createdAt,
  };
}

export class ProviderService {
  static readonly token = serviceToken<ProviderService>('ohmyswitch/providers');
  private readonly store: StoreService;

  constructor(store: StoreService) {
    this.store = store;
  }

  list() {
    return this.store.data.providers.map(summary);
  }

  async create(input: CreateProviderInput) {
    const provider: StoredProvider = {
      id: randomUUID(),
      name: input.name,
      accessPoints: [{ id: 'default', label: '默认', baseUrl: input.baseUrl }],
      endpoints: input.endpoints,
      apiKey: input.apiKey,
      models: [],
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
