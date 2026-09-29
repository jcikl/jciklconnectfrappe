import { afterEach, describe, expect, it, vi } from 'vitest';
import { serverApp } from '../../netlify/functions/_shared/admin';

// Runs before any default app exists in this file, and never creates one.
describe('serverApp configuration errors', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('fails clearly when the service account is missing', () => {
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
    expect(() => serverApp()).toThrow('FIREBASE_SERVICE_ACCOUNT is not set');
  });

  it('does not leak the service account text when it is not valid JSON', () => {
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '{"private_key": "TOPSECRET"');
    expect(() => serverApp()).toThrow(/^FIREBASE_SERVICE_ACCOUNT is not valid JSON$/);
  });
});
