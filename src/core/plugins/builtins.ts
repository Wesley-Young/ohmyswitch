import { DshHarnessPlugin } from '#core/harness-dsh/index.ts';
import { OmpHarnessPlugin } from '#core/harness-omp/index.ts';
import { OpenCodeHarnessPlugin } from '#core/harness-opencode/index.ts';
import { PiHarnessPlugin } from '#core/harness-pi/index.ts';
import type { ManagedPlugin } from './service.ts';

/** The plugins `PluginService` manages, shared by the GUI and the CLI so both load the same harnesses. */
export const builtinPlugins: readonly ManagedPlugin[] = [
  OpenCodeHarnessPlugin,
  PiHarnessPlugin,
  DshHarnessPlugin,
  OmpHarnessPlugin,
];
