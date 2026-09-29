export interface ClientConfig {
  projectId: string;
  apiKey: string;
  authDomain?: string;
  appId?: string;
  /** Host of the local emulators (no scheme or port), e.g. 'localhost' or '10.0.2.2'. Unset in production. */
  emulatorHost?: string;
  /** Base URL of the API, e.g. 'http://localhost:8888'. */
  apiBaseUrl: string;
  /** Firebase app name; tests use it to run several clients. Default '[DEFAULT]'. */
  appName?: string;
}
