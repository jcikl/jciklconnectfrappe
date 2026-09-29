import type { Auth } from 'firebase-admin/auth';
import { loadUserContext } from './access';
import { authenticate } from './auth';
import { ApiError } from './errors';
import { corsHeaders, json, readJson, toErrorResponse } from './http';
import { createDoc, deleteDoc, updateDoc, type PipelineDeps } from './pipeline';

export interface ResourceDeps extends PipelineDeps {
  auth: Auth;
  allowedOrigins: readonly string[];
}

export interface ResourceParams {
  doctype?: string;
  id?: string;
}

/** POST /api/resource/:doctype, PUT and DELETE /api/resource/:doctype/:id. */
export async function handleResource(req: Request, params: ResourceParams, deps: ResourceDeps): Promise<Response> {
  const cors = corsHeaders(req, deps.allowedOrigins);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const { doctype, id } = params;
    if (!doctype) throw new ApiError(404, 'not_found', 'Not found');
    const creating = req.method === 'POST' && !id;
    const changing = (req.method === 'PUT' || req.method === 'DELETE') && Boolean(id);
    if (!creating && !changing) throw new ApiError(405, 'method_not_allowed', `${req.method} is not supported here`);

    const user = await loadUserContext(deps.db, await authenticate(req, deps.auth));
    if (req.method === 'POST') {
      const body = await readJson(req);
      const result = await createDoc(deps, user, doctype, { orgId: body.orgId, data: body.data });
      return json(201, { data: result.doc }, cors);
    }
    if (req.method === 'PUT') {
      const body = await readJson(req);
      const result = await updateDoc(deps, user, doctype, id!, { data: body.data });
      return json(200, { data: result.doc }, cors);
    }
    await deleteDoc(deps, user, doctype, id!);
    return new Response(null, { status: 204, headers: cors });
  } catch (err) {
    return toErrorResponse(err, cors);
  }
}
