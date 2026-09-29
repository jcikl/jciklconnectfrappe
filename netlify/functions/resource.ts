import { controllers, registry } from '@jci/doctypes';
import type { Config, Context } from '@netlify/functions';
import { getAuth } from 'firebase-admin/auth';
import { firestoreFor, serverApp } from './_shared/admin';
import { serverEffects, serverTxEffects } from './_shared/effects';
import { corsHeaders, parseOrigins, toErrorResponse } from './_shared/http';
import { handleResource, type ResourceDeps } from './_shared/resource';

export default async (req: Request, context: Context): Promise<Response> => {
  const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);
  let deps: ResourceDeps;
  try {
    const app = serverApp();
    deps = {
      db: firestoreFor(app),
      auth: getAuth(app),
      registry,
      controllers,
      effects: serverEffects,
      txEffects: serverTxEffects,
      allowedOrigins,
    };
  } catch (err) {
    // Setup failures (missing or malformed credentials) get the generic JSON 500; details are only logged.
    return toErrorResponse(err, corsHeaders(req, allowedOrigins));
  }
  return handleResource(req, context.params, deps);
};

export const config: Config = {
  path: ['/api/resource/:doctype', '/api/resource/:doctype/:id'],
};
