import { type Disposable, serviceToken } from '@fraqjs/kernel';
import { protocol } from 'electron';

import { appOrigin, appScheme } from './scheme.ts';

/** Owns the app:// handler: built when the plugin applies, serving from `listen()` until the context stops. */
export class AppProtocol implements Disposable {
  static readonly token = serviceToken<AppProtocol>('ohmyswitch/protocol');
  /** The origin pages are loaded from. */
  readonly origin = appOrigin;
  private readonly handler: (request: Request) => Promise<Response>;
  private listening = false;

  constructor(handler: (request: Request) => Promise<Response>) {
    this.handler = handler;
  }

  listen() {
    if (this.listening) return;
    protocol.handle(appScheme, this.handler);
    this.listening = true;
  }

  dispose() {
    if (!this.listening) return;
    protocol.unhandle(appScheme);
    this.listening = false;
  }
}
