import { controllers, registry } from '@jci/doctypes';
import type { Config, Context } from '@netlify/functions';
import { getAuth } from 'firebase-admin/auth';
import { firestoreFor, serverApp } from './_shared/admin';
import { serverEffects } from './_shared/effects';
import { parseOrigins } from './_shared/http';
import { handleResource } from './_shared/resource';

export default async (req: Request, context: Context): Promise<Response> => {
  const app = serverApp();
  return handleResource(req, context.params, {
    db: firestoreFor(app),
    auth: getAuth(app),
    registry,
    controllers,
    effects: serverEffects,
    allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  });
};

export const config: Config = {
  path: ['/api/resource/:doctype', '/api/resource/:doctype/:id'],
};
