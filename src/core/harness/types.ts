/** Supported harnesses; the order is the display order. */
export const harnessIds = ['opencode', 'pi', 'dsh'] as const;

export type HarnessId = (typeof harnessIds)[number];

/** Where a harness looks for its configuration: the user's home and environment variables. */
export interface HarnessEnvironment {
  home: string;
  env: Readonly<Record<string, string | undefined>>;
}

/** Static facts about a harness. Reading and writing its config are added per harness as adapters grow. */
export interface HarnessDescriptor {
  readonly id: HarnessId;
  readonly name: string;
  readonly homepage: string;
  /** The harness's own directory; its existence means the harness has been used on this machine. */
  homeDir(environment: HarnessEnvironment): string;
  /** Candidate provider config files in priority order. The first existing one is used; otherwise the first is created. */
  configFiles(environment: HarnessEnvironment): string[];
}
