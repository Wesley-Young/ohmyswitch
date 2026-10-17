import { type ContextOf, createPluginFactory, defineContext } from '@fraqjs/kernel';

/** Plugins get their configuration as install arguments from `app.ts`; the context itself carries none. */
export const AppContext = defineContext<void>()
  .subsystems(() => ({}))
  .builtins(() => ({}))
  .build();

export type AppContext = ContextOf<typeof AppContext>;
export const definePlugin = createPluginFactory<AppContext>();
