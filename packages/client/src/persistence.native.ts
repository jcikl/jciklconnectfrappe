import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from 'firebase/auth';
import type { Persistence } from 'firebase/auth';

// getReactNativePersistence is only exported by firebase/auth's react-native build,
// which TypeScript does not resolve, so it is read off the module namespace at runtime.
const { getReactNativePersistence } = FirebaseAuth as unknown as {
  getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
};

/** Keeps the signed-in user across app restarts on iOS and Android. */
export function authPersistence(): Persistence | undefined {
  return getReactNativePersistence(AsyncStorage);
}
