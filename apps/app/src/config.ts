import type { ClientConfig } from '@jci/client';
import { Platform } from 'react-native';

/** A missing or invalid EXPO_PUBLIC_* setting. The root layout shows its message instead of the app. */
export class ConfigError extends Error {}

// The Android emulator reaches the PC at 10.0.2.2; web and the iOS simulator use localhost.
// A physical phone needs EXPO_PUBLIC_EMULATOR_HOST / EXPO_PUBLIC_API_BASE_URL set to the PC's LAN address.
const LOCAL_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

/**
 * Rules (env vars live in apps/app/.env; keep the direct process.env.EXPO_PUBLIC_X reads so Expo inlines them):
 * - Emulators are on in dev (__DEV__) and off in production builds. EXPO_PUBLIC_USE_EMULATORS='true'/'false' overrides.
 * - With the emulators on, the project defaults to demo-jci. With them off, the Firebase project id and API key are required.
 * - API base URL: dev defaults to the local host on :8888; a production web build uses '' (same origin, where the
 *   Netlify function lives); a production native build requires EXPO_PUBLIC_API_BASE_URL.
 * Throws ConfigError, so a misconfigured build shows a clear message instead of silently targeting localhost.
 */
export function loadClientConfig(): ClientConfig {
  const override = process.env.EXPO_PUBLIC_USE_EMULATORS;
  const useEmulators = override === 'true' || (override !== 'false' && __DEV__);
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? (useEmulators ? 'demo-jci' : undefined);
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? (useEmulators ? 'demo-api-key' : undefined);
  if (!projectId || !apiKey) {
    throw new ConfigError('EXPO_PUBLIC_FIREBASE_PROJECT_ID and EXPO_PUBLIC_FIREBASE_API_KEY must be set when the emulators are off.');
  }
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? (__DEV__ ? `http://${LOCAL_HOST}:8888` : Platform.OS === 'web' ? '' : undefined);
  if (apiBaseUrl === undefined) throw new ConfigError('EXPO_PUBLIC_API_BASE_URL must be set for a production native build.');
  return {
    projectId,
    apiKey,
    // The Auth SDK's popup and redirect flows require an authDomain, even against the emulator.
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    emulatorHost: useEmulators ? (process.env.EXPO_PUBLIC_EMULATOR_HOST ?? LOCAL_HOST) : undefined,
    apiBaseUrl,
  };
}
