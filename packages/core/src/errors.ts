/** Thrown when DocType metadata (or a naming pattern / custom field) is invalid. */
export class MetaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaError';
  }
}

/** A user-facing rejection thrown by a controller hook. The API maps it to HTTP 422. */
export class ValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
