/** Business error categories; each transport maps them to its own status codes. */
export type AppErrorKind = 'bad_request' | 'not_found' | 'conflict' | 'precondition_failed' | 'bad_gateway';

/** An error whose message can be shown to the user as is. Business code never depends on transport errors. */
export class AppError extends Error {
  override readonly name = 'AppError';
  readonly kind: AppErrorKind;
  constructor(kind: AppErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.kind = kind;
  }
}
