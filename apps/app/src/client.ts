import { initClient, type FirebaseClient } from '@jci/client';
import { ConfigError, loadClientConfig } from './config';

export type AppClient = { client: FirebaseClient; configError?: undefined } | { client?: undefined; configError: string };

/** The app's single Firebase client, or the reason the build is misconfigured (shown on screen by the root layout). */
export const appClient: AppClient = (() => {
  try {
    return { client: initClient(loadClientConfig()) };
  } catch (err) {
    if (err instanceof ConfigError) return { configError: err.message };
    throw err;
  }
})();
