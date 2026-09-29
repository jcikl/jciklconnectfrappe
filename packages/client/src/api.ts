/** An error from /api/resource, carrying the server's `{ error: { code, message, details } }`. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiClient {
  create(doctype: string, input: { orgId?: string; data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  update(doctype: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  remove(doctype: string, id: string): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  getIdToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? fetch;
  const path = (doctype: string, id?: string) =>
    `/api/resource/${encodeURIComponent(doctype)}${id === undefined ? '' : `/${encodeURIComponent(id)}`}`;

  async function send(method: 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<unknown> {
    const token = await opts.getIdToken();
    if (!token) throw new ApiRequestError(401, 'unauthenticated', 'Sign in first');
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await doFetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiRequestError(0, 'network', 'Could not reach the server. Check your connection and try again.');
    }
    if (res.status === 204) return null;
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
      throw new ApiRequestError(
        res.status,
        typeof error.code === 'string' ? error.code : 'http_error',
        typeof error.message === 'string' ? error.message : `Request failed (${res.status})`,
        error.details,
      );
    }
    return payload;
  }

  const dataOf = (payload: unknown): Record<string, unknown> =>
    isRecord(payload) && isRecord(payload.data) ? payload.data : {};

  return {
    create: async (doctype, input) => dataOf(await send('POST', path(doctype), input)),
    update: async (doctype, id, data) => dataOf(await send('PUT', path(doctype, id), { data })),
    remove: async (doctype, id) => {
      await send('DELETE', path(doctype, id));
    },
  };
}
