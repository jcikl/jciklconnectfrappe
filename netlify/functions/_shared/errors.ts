/** An error the API reports to the caller as `{ error: { code, message, details } }` with `status`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Issue {
  path: string;
  message: string;
}

export function invalid(issues: Issue[], message = 'Validation failed'): ApiError {
  return new ApiError(422, 'invalid', message, { issues });
}
