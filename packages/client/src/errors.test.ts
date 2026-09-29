import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './errors';

describe('authErrorMessage', () => {
  it('maps Firebase Auth codes to plain messages', () => {
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toBe('Email or password is incorrect.');
    expect(authErrorMessage({ code: 'auth/wrong-password' })).toBe('Email or password is incorrect.');
    expect(authErrorMessage({ code: 'auth/user-not-found' })).toBe('Email or password is incorrect.');
    expect(authErrorMessage({ code: 'auth/invalid-email' })).toBe('Enter a valid email address.');
    expect(authErrorMessage({ code: 'auth/user-disabled' })).toBe('This account has been disabled. Contact an administrator.');
    expect(authErrorMessage({ code: 'auth/too-many-requests' })).toBe('Too many attempts. Wait a moment and try again.');
    expect(authErrorMessage({ code: 'auth/network-request-failed' })).toBe('Could not reach the sign-in service. Check your connection.');
  });

  it('stays quiet when the user closes the Google popup', () => {
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toBeNull();
    expect(authErrorMessage({ code: 'auth/cancelled-popup-request' })).toBeNull();
  });

  it('falls back to a generic message', () => {
    expect(authErrorMessage({ code: 'auth/something-new' })).toBe('Sign-in failed. Please try again.');
    expect(authErrorMessage(new Error('boom'))).toBe('Sign-in failed. Please try again.');
  });
});
