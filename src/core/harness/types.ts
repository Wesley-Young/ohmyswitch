import type { HarnessAdapter } from './adapter.ts';

/** Supported harnesses; the order is the display order. */
export const harnessIds = ['opencode', 'pi'] as const;

export type HarnessId = (typeof harnessIds)[number];

/** Where a harness looks for its configuration: the user's home and environment variables. */
export interface HarnessEnvironment {
  home: string;
  env: Readonly<Record<string, string | undefined>>;
}

/** A harness ohmyswitch can write providers into: where it lives, and how its config is read and written. */
export interface HarnessDescriptor {
  readonly id: HarnessId;
  readonly name: string;
  readonly homepage: string;
  /** The harness's own directory; its existence means the harness has been used on this machine. */
  homeDir(environment: HarnessEnvironment): string;
  /** Candidate provider config files in priority order. The first existing one is used; otherwise the first is created. */
  configFiles(environment: HarnessEnvironment): string[];
  /** Reads and writes ohmyswitch's entries in the config file. */
  readonly adapter: HarnessAdapter;
}
