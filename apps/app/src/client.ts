import { initClient } from '@jci/client';
import { clientConfig } from './config';

/** The app's single Firebase client. */
export const client = initClient(clientConfig);
