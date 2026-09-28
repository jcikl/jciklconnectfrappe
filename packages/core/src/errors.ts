/** Thrown when DocType metadata (or a naming pattern / custom field) is invalid. */
export class MetaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaError';
  }
}
