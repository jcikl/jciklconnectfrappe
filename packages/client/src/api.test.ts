import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createApiClient } from './api';

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createApiClient', () => {
  it('sends an authenticated create and returns the saved document', async () => {
    const { fetch, calls } = fakeFetch(() => json(201, { data: { id: 'jci-pj', title: 'JCI PJ' } }));
    const api = createApiClient({ baseUrl: 'http://localhost:8888/', getIdToken: async () => 'tok', fetch });
    const doc = await api.create('Organization', { orgId: 'jci-malaysia-central', data: { code: 'jci-pj' } });
    expect(doc).toEqual({ id: 'jci-pj', title: 'JCI PJ' });
    expect(calls[0]!.url).toBe('http://localhost:8888/api/resource/Organization');
    expect(calls[0]!.init.method).toBe('POST');
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe('Bearer tok');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ orgId: 'jci-malaysia-central', data: { code: 'jci-pj' } });
  });

  it('encodes ids and handles update and delete', async () => {
    const { fetch, calls } = fakeFetch((c) => (c.init.method === 'DELETE' ? new Response(null, { status: 204 }) : json(200, { data: { id: 'a b' } })));
    const api = createApiClient({ baseUrl: 'http://api', getIdToken: async () => 'tok', fetch });
    expect(await api.update('Person', 'a b', { phone: '1' })).toEqual({ id: 'a b' });
    await api.remove('Person', 'a b');
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ['PUT', 'http://api/api/resource/Person/a%20b'],
      ['DELETE', 'http://api/api/resource/Person/a%20b'],
    ]);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ data: { phone: '1' } });
  });

  it('turns API error responses into ApiRequestError', async () => {
    const { fetch } = fakeFetch(() =>
      json(403, { error: { code: 'field_not_writable', message: 'You cannot change some of these fields', details: { fields: ['level'] } } }),
    );
    const api = createApiClient({ baseUrl: 'http://api', getIdToken: async () => 'tok', fetch });
    const err = await api.update('Organization', 'jci-kl', { level: 'national' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 403, code: 'field_not_writable', message: 'You cannot change some of these fields', details: { fields: ['level'] } });
  });

  it('reports non-JSON errors, network failures and missing tokens', async () => {
    const bad = createApiClient({ baseUrl: 'http://api', getIdToken: async () => 'tok', fetch: fakeFetch(() => new Response('oops', { status: 502 })).fetch });
    await expect(bad.remove('Person', 'x')).rejects.toMatchObject({ status: 502, code: 'http_error' });

    const offline = createApiClient({
      baseUrl: 'http://api',
      getIdToken: async () => 'tok',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });
    await expect(offline.remove('Person', 'x')).rejects.toMatchObject({ status: 0, code: 'network' });

    const { fetch, calls } = fakeFetch(() => json(200, {}));
    const signedOut = createApiClient({ baseUrl: 'http://api', getIdToken: async () => null, fetch });
    await expect(signedOut.remove('Person', 'x')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(calls).toHaveLength(0);
  });
});
