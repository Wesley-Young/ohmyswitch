import * as prompts from '@clack/prompts';

import { exitCodes } from './errors.ts';

/** Reports which step of a slow task has started; each call replaces the message shown. */
export type Stage = (message: string) => void;

/**
 * Run a slow task with a spinner on stderr, whose message each stage replaces. Nothing is shown until the first
 * stage, so a task answered from a cache does not flash one; the spinner is cleared when the task ends, since what
 * follows (a result, or a prompt) says how it went. When `enabled` is false, stages are ignored.
 */
export async function withProgress<T>(enabled: boolean, task: (stage: Stage) => Promise<T>): Promise<T> {
  let spinner: ReturnType<typeof prompts.spinner> | undefined;
  const stage: Stage = (message) => {
    if (!enabled) return;
    if (spinner) {
      spinner.message(message);
      return;
    }
    spinner = prompts.spinner({
      output: process.stderr,
      // While it spins, the spinner owns SIGINT, which would otherwise no longer end the process. Ctrl-C quits.
      onCancel: () => process.exit(exitCodes.cancelled),
    });
    spinner.start(message);
  };
  try {
    return await task(stage);
  } finally {
    spinner?.clear();
  }
}
