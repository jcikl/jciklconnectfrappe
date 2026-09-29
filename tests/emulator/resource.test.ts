import { buildUserAccess, type RoleGrant } from '@jci/core';
import { controllers } from '@jci/doctypes';
import { getAuth } from 'firebase-admin/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serverEffects } from '../../netlify/functions/_shared/effects';
import { handleResource, type ResourceDeps } from '../../netlify/functions/_shared/resource';
import { NOW, seedOrgs, testRegistry } from './fixtures';
import { clearAuth, signUp, testProject } from './helpers';

// The Auth emulator issues sign-up tokens for the default project, so this file uses demo-jci.
const project = testProject('demo-jci');
const ORIGIN = 'http://localhost:8081';
let deps: ResourceDeps;
let officer: { uid: string; idToken: string };
let member: { uid: string; idToken: string };

async function setAccess(uid: string, personId: string, grants: RoleGrant[]) {
  await project.db.collection('userAccess').doc(uid).set(buildUserAccess(uid, personId, grants));
}

function call(method: string, path: string, opts: { token?: string; body?: unknown; rawBody?: string; origin?: string } = {}) {
  const [, , , doctype, id] = path.split('/');
  const headers = new Headers();
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`);
  if (opts.origin) headers.set('origin', opts.origin);
  const body = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  if (body !== undefined) headers.set('content-type', 'application/json');
  return handleResource(new Request(`http://localhost${path}`, { method, headers, body }), { doctype, id }, deps);
}

beforeAll(async () => {
  await clearAuth(project.projectId);
  officer = await signUp('officer@jci.test');
  member = await signUp('member@jci.test');
  deps = {
    db: project.db,
    auth: getAuth(project.app),
    registry: testRegistry,
    controllers,
    effects: serverEffects,
    allowedOrigins: [ORIGIN],
    now: () => NOW,
  };
});
beforeEach(async () => {
  await project.clear();
  await seedOrgs(project.db);
  await setAccess(officer.uid, 'p-officer', [{ role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true }]);
  await setAccess(member.uid, 'p1', [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }]);
});
afterAll(() => project.close());

const createPerson = async (data: Record<string, unknown> = {}) => {
  const res = await call('POST', '/api/resource/Person', { token: officer.idToken, body: { orgId: 'jci-kl', data: { fullName: 'Tan', ...data } } });
  return (await res.json()).data as { id: string };
};

describe('/api/resource', () => {
  it('requires a valid ID token', async () => {
    expect((await call('POST', '/api/resource/Person', { body: {} })).status).toBe(401);
    const res = await call('POST', '/api/resource/Person', { token: 'not-a-token', body: {} });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthenticated', message: expect.any(String) } });
  });

  it('accepts the Bearer scheme in any case', async () => {
    const headers = new Headers({ authorization: `bearer  ${officer.idToken}`, 'content-type': 'application/json' });
    const body = JSON.stringify({ orgId: 'jci-kl', data: { fullName: 'Lowercase' } });
    const res = await handleResource(new Request('http://localhost/api/resource/Person', { method: 'POST', headers, body }), { doctype: 'Person' }, deps);
    expect(res.status).toBe(201);
  });

  it('creates a document and returns it', async () => {
    const res = await call('POST', '/api/resource/Person', { token: officer.idToken, body: { orgId: 'jci-kl', data: { fullName: 'Tan Ah Kow' } } });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()).data).toMatchObject({ id: 'PER-2026-00001', fullName: 'Tan Ah Kow', orgId: 'jci-kl', createdBy: officer.uid });
  });

  it('maps pipeline errors to JSON error responses', async () => {
    const forbidden = await call('POST', '/api/resource/Person', { token: member.idToken, body: { orgId: 'jci-kl', data: { fullName: 'A' } } });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error.code).toBe('forbidden');

    const invalid = await call('POST', '/api/resource/Person', { token: officer.idToken, body: { orgId: 'jci-kl', data: { fullName: '' } } });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.details.issues[0].path).toBe('fullName');

    const unknown = await call('POST', '/api/resource/Nope', { token: officer.idToken, body: { orgId: 'jci-kl', data: {} } });
    expect(unknown.status).toBe(404);
  });

  it('rejects bodies that are not JSON objects', async () => {
    const res = await call('POST', '/api/resource/Person', { token: officer.idToken, rawBody: 'nope' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_json');
    expect((await call('POST', '/api/resource/Person', { token: officer.idToken, body: [1] })).status).toBe(400);
  });

  it('updates and deletes', async () => {
    const { id } = await createPerson();
    const put = await call('PUT', `/api/resource/Person/${id}`, { token: officer.idToken, body: { data: { phone: '2' } } });
    expect(put.status).toBe(200);
    expect((await put.json()).data).toMatchObject({ id, phone: '2' });
    const del = await call('DELETE', `/api/resource/Person/${id}`, { token: officer.idToken });
    expect(del.status).toBe(204);
    expect((await project.db.collection('persons').doc(id).get()).exists).toBe(false);
  });

  it('rejects a member changing a locked field on their own record', async () => {
    const { id } = await createPerson({ membershipType: 'Probation' });
    await project.db.collection('persons').doc(id).update({ ownerPersonId: 'p1' });
    const ok = await call('PUT', `/api/resource/Person/${id}`, { token: member.idToken, body: { data: { phone: '3' } } });
    expect(ok.status).toBe(200);
    const res = await call('PUT', `/api/resource/Person/${id}`, { token: member.idToken, body: { data: { membershipType: 'Official' } } });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatchObject({ code: 'field_not_writable', details: { fields: ['membershipType'] } });
  });

  it('answers only POST, PUT and DELETE in the right shapes', async () => {
    expect((await call('GET', '/api/resource/Person', { token: officer.idToken })).status).toBe(405);
    expect((await call('POST', '/api/resource/Person/PER-1', { token: officer.idToken, body: {} })).status).toBe(405);
    expect((await call('PUT', '/api/resource/Person', { token: officer.idToken, body: {} })).status).toBe(405);
  });

  it('sends CORS headers to allowed origins only', async () => {
    const preflight = await call('OPTIONS', '/api/resource/Person', { origin: ORIGIN });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
    const other = await call('OPTIONS', '/api/resource/Person', { origin: 'https://evil.example' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    const error = await call('POST', '/api/resource/Person', { origin: ORIGIN, body: {} });
    expect(error.status).toBe(401);
    expect(error.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });
});
