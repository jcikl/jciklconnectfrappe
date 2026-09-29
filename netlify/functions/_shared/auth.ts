import type { Auth } from 'firebase-admin/auth';
import { ApiError } from './errors';

/** The uid of the caller's Firebase ID token (Authorization: Bearer <token>). */
export async function authenticate(req: Request, auth: Auth): Promise<string> {
  const match = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) throw new ApiError(401, 'unauthenticated', 'Sign in first');
  try {
    return (await auth.verifyIdToken(match[1]!)).uid;
  } catch {
    throw new ApiError(401, 'unauthenticated', 'Your session has expired. Sign in again.');
  }
}
