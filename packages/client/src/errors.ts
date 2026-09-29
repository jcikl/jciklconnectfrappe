const MESSAGES: Record<string, string | null> = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact an administrator.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection.',
  'auth/popup-closed-by-user': null,
  'auth/cancelled-popup-request': null,
};

/** A message to show for a failed sign-in, or null when the user simply cancelled. */
export function authErrorMessage(err: unknown): string | null {
  const code = err !== null && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code]! : 'Sign-in failed. Please try again.';
}
