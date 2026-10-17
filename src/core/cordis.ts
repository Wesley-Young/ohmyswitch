/**
 * cordis's fiber states. cordis declares `FiberState` as an ambient const enum, which cannot be referenced under
 * `verbatimModuleSyntax`, so the values are repeated here.
 */
export const FiberState = {
  PENDING: 0,
  LOADING: 1,
  ACTIVE: 2,
  FAILED: 3,
  DISPOSED: 4,
  UNLOADING: 5,
} as const;
