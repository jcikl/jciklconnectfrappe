import { ValidationError } from '@jci/core';
import { ApiError } from './errors';

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body must be JSON');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'invalid_json', 'The request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '');
}

/** CORS for browser clients on another origin (e.g. Expo web in dev). Native apps send no Origin. */
export function corsHeaders(req: Request, allowed: readonly string[]): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin || !allowed.includes(origin)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

export function toErrorResponse(err: unknown, headers: Record<string, string>): Response {
  if (err instanceof ApiError) {
    const error = { code: err.code, message: err.message, ...(err.details === undefined ? {} : { details: err.details }) };
    return json(err.status, { error }, headers);
  }
  if (err instanceof ValidationError) {
    const details = { issues: [{ path: err.field ?? '', message: err.message }] };
    return json(422, { error: { code: 'invalid', message: err.message, details } }, headers);
  }
  console.error(err);
  return json(500, { error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, headers);
}
