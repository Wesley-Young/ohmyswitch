import { AppError, type AppErrorKind } from '#core/errors.ts';

/** Why a run failed, which decides the exit status. `failed` covers partial failures and anything unexpected. */
export type ErrorKind = AppErrorKind | 'usage' | 'cancelled' | 'failed';

/** Exit statuses, part of the CLI's contract with scripts. */
export const exitCodes = {
  failed: 1,
  usage: 2,
  bad_request: 2,
  not_found: 3,
  conflict: 4,
  precondition_failed: 5,
  bad_gateway: 6,
  cancelled: 130,
} as const satisfies Record<ErrorKind, number>;

/** An error whose message is shown to the user as is, with an optional next step. */
export class CliError extends Error {
  override readonly name = 'CliError';
  readonly kind: ErrorKind;
  readonly hint: string | undefined;
  constructor(kind: ErrorKind, message: string, hint?: string) {
    super(message);
    this.kind = kind;
    this.hint = hint;
  }
}

/** The user backed out of a prompt or a confirmation: with Esc, or with Ctrl-C, which ends the CLI. */
export class Cancelled extends CliError {
  readonly interrupted: boolean;
  constructor(interrupted = false) {
    super('cancelled', 'Cancelled');
    this.interrupted = interrupted;
  }
}

/** A value of one parameter is not acceptable; the resolver adds which parameter it was. */
export class ParamError extends Error {
  override readonly name = 'ParamError';
  readonly kind: AppErrorKind;
  constructor(message: string, kind: AppErrorKind = 'bad_request') {
    super(message);
    this.kind = kind;
  }
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof AppError) return new CliError(error.kind, error.message);
  if (error instanceof ParamError) return new CliError(error.kind, error.message);
  return new CliError('failed', error instanceof Error ? error.message : String(error));
}
