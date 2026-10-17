import type { Endpoint } from '../endpoints.ts';
import type { HarnessAdapter } from './adapter.ts';

/** Supported harnesses; the order is the display order. */
export const harnessIds = ['opencode', 'pi', 'dsh'] as const;

export type HarnessId = (typeof harnessIds)[number];

/** Where a harness looks for its configuration: the user's home and environment variables. */
export interface HarnessEnvironment {
  home: string;
  env: Readonly<Record<string, string | undefined>>;
}

/** One file a provider is written into, and how ohmyswitch's entries in it are read and written. */
export interface HarnessConfigFile {
  path: string;
  adapter: HarnessAdapter;
  /** A file whose `.lock` sibling is held around each edit, matching the harness's own writers. */
  lockPath?: string;
}

/** A harness ohmyswitch can write providers into: where it lives, and how its config is read and written. */
export interface HarnessDescriptor {
  readonly id: HarnessId;
  readonly name: string;
  readonly homepage: string;
  /** The harness's own directory; its existence means the harness has been used on this machine. */
  homeDir(environment: HarnessEnvironment): string;
  /**
   * Every file a provider is written into, in write order; removal runs in reverse. Throws an AppError when the
   * harness cannot be written to as it is.
   */
  configFiles(environment: HarnessEnvironment): Promise<HarnessConfigFile[]>;
  /** The config location shown to the user; defaults to the first file. */
  configLocation?(files: readonly HarnessConfigFile[], environment: HarnessEnvironment): string;
  /** Endpoints the harness cannot serve; providers with them cannot be applied. */
  readonly unsupportedEndpoints?: readonly Endpoint[];
}
