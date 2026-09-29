import type { ClientConfig } from '@jci/client';
import { Platform } from 'react-native';

// The Android emulator reaches the PC at 10.0.2.2; web and the iOS simulator use localhost.
// A physical phone needs EXPO_PUBLIC_EMULATOR_HOST / EXPO_PUBLIC_API_BASE_URL set to the PC's LAN address.
const LOCAL_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const useEmulators = process.env.EXPO_PUBLIC_USE_EMULATORS !== 'false';

export const clientConfig: ClientConfig = {
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-jci',
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'demo-api-key',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  emulatorHost: useEmulators ? (process.env.EXPO_PUBLIC_EMULATOR_HOST ?? LOCAL_HOST) : undefined,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? `http://${LOCAL_HOST}:8888`,
};
