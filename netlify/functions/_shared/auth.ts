import type { Auth } from 'firebase-admin/auth';
import { ApiError } from './errors';

/** The uid of the caller's Firebase ID token (Authorization: Bearer <token>). */
export async function authenticate(req: Request, auth: Auth): Promise<string> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!match) throw new ApiError(401, 'unauthenticated', 'Sign in first');
  try {
    return (await auth.verifyIdToken(match[1]!)).uid;
  } catch (err) {
    if (isTokenError(err)) throw new ApiError(401, 'unauthenticated', 'Your session has expired. Sign in again.');
    throw err; // server-side failure (certs, project id, ...): let toErrorResponse log it and answer 500
  }
}

/** Firebase Auth errors that blame the caller's token (expired, revoked, malformed, disabled user...). */
function isTokenError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('auth/') && code !== 'auth/internal-error' && code !== 'auth/insufficient-permission';
}
