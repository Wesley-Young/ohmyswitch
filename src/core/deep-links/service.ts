import { type Logger, serviceToken } from '@fraqjs/kernel';

import type { StoreService } from '../store/service.ts';
import { findMatch, type ImportDraft, parseLink } from './link.ts';

import { randomUUID } from 'node:crypto';
import { EventEmitter, on } from 'node:events';

export interface DeepLinkDeps {
  store: StoreService;
  logger: Logger;
}

/** Something a front end should react to: an import is waiting, or a link could not be understood. */
export interface DeepLinkEvent {
  id: string;
  type: 'import' | 'unsupported';
}

interface PendingImport {
  id: string;
  draft: ImportDraft;
}

/**
 * Links opened from outside ohmyswitch. An import link becomes the pending import, replacing any earlier one,
 * until the user saves or cancels it; nothing is saved or fetched before that. Links carry API keys, so their
 * content is never logged.
 */
export class DeepLinkService {
  static readonly token = serviceToken<DeepLinkService>('ohmyswitch/deep-links');
  private readonly deps: DeepLinkDeps;
  private readonly emitter = new EventEmitter();
  private current: PendingImport | undefined;

  constructor(deps: DeepLinkDeps) {
    this.deps = deps;
  }

  open(link: string) {
    const parsed = parseLink(link);
    const id = randomUUID();
    if (parsed.kind === 'unsupported') {
      this.deps.logger.info('Ignored an unsupported link');
      this.emit({ id, type: 'unsupported' });
      return;
    }
    this.current = { id, draft: parsed.draft };
    this.emit({ id, type: 'import' });
  }

  /** The import waiting for review, with the provider it would update by default. */
  pending() {
    if (!this.current) return null;
    const match = findMatch(this.deps.store.data.providers, this.current.draft);
    return {
      id: this.current.id,
      draft: this.current.draft,
      match: match ? { providerId: match.id, name: match.name, endpoint: match.endpoint } : null,
    };
  }

  /** Drop the pending import once handled. A newer link that arrived meanwhile is kept. */
  dismiss(id: string) {
    if (this.current?.id === id) this.current = undefined;
  }

  /**
   * Events from now on, preceded by the pending import unless `lastEventId` shows the listener has seen it, so a
   * window that connects after the link arrived (as on a cold start) still opens it.
   */
  async *events(signal: AbortSignal, lastEventId?: string | null): AsyncGenerator<DeepLinkEvent> {
    // Listen before replaying, so an event arriving in between is not lost.
    const incoming = on(this.emitter, 'event', { signal });
    if (this.current && this.current.id !== lastEventId) yield { id: this.current.id, type: 'import' };
    try {
      for await (const [event] of incoming) yield event as DeepLinkEvent;
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }

  private emit(event: DeepLinkEvent) {
    this.emitter.emit('event', event);
  }
}
