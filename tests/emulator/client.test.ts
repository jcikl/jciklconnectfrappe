import {
  createAccessStore,
  createAuthStore,
  createDocsStore,
  createDocStore,
  initClient,
  signInWithEmail,
  signOutUser,
  type AccessState,
  type Store,
} from '@jci/client';
import { buildUserAccess, listFilters, scopeOptions } from '@jci/core';
import { Organization } from '@jci/doctypes';
import { deleteApp } from 'firebase/app';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedOrgs } from './fixtures';
import { clearAuth, requireEmulators, signUp, testProject } from './helpers';

// Sign-up tokens come from the Auth emulator's default project, so this file uses demo-jci.
const admin = testProject('demo-jci');
const client = initClient({
  projectId: 'demo-jci',
  apiKey: 'demo-api-key',
  emulatorHost: requireEmulators().firestoreHost.split(':')[0]!,
  apiBaseUrl: 'http://localhost:8888',
  appName: 'client-test',
});
const EMAIL = 'client-member@jci.test';
let uid = '';

/** Resolves with the first snapshot that satisfies `done`. */
function waitFor<T>(store: Store<T>, done: (value: T) => boolean, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out; last state ${JSON.stringify(store.getSnapshot())}`));
    }, timeoutMs);
    const check = () => {
      const value = store.getSnapshot();
      if (!done(value)) return;
      clearTimeout(timer);
      queueMicrotask(() => unsubscribe());
      resolve(value);
    };
    const unsubscribe = store.subscribe(check);
    check();
  });
}

beforeAll(async () => {
  await admin.clear();
  await clearAuth(admin.projectId);
  await seedOrgs(admin.db);
  ({ uid } = await signUp(EMAIL));
  await admin.db
    .collection('userAccess')
    .doc(uid)
    .set(buildUserAccess(uid, 'p-member', [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }]));
});

afterAll(async () => {
  await signOutUser(client).catch(() => {});
  await deleteApp(client.app);
  await admin.close();
});

describe('@jci/client against the emulators', () => {
  const auth = createAuthStore(client.auth);

  it('reports signed out, then signed in', async () => {
    expect((await waitFor(auth, (s) => s.status !== 'loading')).status).toBe('signedOut');
    await signInWithEmail(client, EMAIL, 'emulator-only-password');
    expect(await waitFor(auth, (s) => s.status === 'signedIn')).toEqual({ status: 'signedIn', uid, email: EMAIL });
  });

  it('loads the caller access', async () => {
    const access = (await waitFor(createAccessStore(client.db, uid), (s) => s.status !== 'loading')) as Extract<AccessState, { status: 'ready' }>;
    expect(access.status).toBe('ready');
    expect(access.user).toEqual({ uid, personId: 'p-member', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] });
  });

  it('lists documents with the filters the rules allow', async () => {
    const user = { uid, personId: 'p-member', grants: [{ role: 'Member' as const, orgId: 'jci-kl', withDescendants: false }] };
    const filters = listFilters(Organization, user, scopeOptions(user)[0]!)!;
    const docs = await waitFor(createDocsStore(client.db, Organization.collection, filters), (s) => s.status !== 'loading');
    expect(docs.status).toBe('ready');
    expect(docs.status === 'ready' && docs.docs.map((d) => d.id)).toEqual(['jci-kl']);
  });

  it('reports an error for a query the rules deny', async () => {
    const denied = createDocsStore(client.db, Organization.collection, [{ field: 'orgPath', op: 'array-contains', value: 'jci-malaysia' }]);
    expect((await waitFor(denied, (s) => s.status !== 'loading')).status).toBe('error');
  });

  it('reads single documents, with an error when the rules deny', async () => {
    const kl = await waitFor(createDocStore(client.db, Organization.collection, 'jci-kl'), (s) => s.status !== 'loading');
    expect(kl.status === 'ready' && kl.doc?.data.title).toBe('JCI Kuala Lumpur');
    const pj = await waitFor(createDocStore(client.db, Organization.collection, 'jci-pj'), (s) => s.status !== 'loading');
    expect(pj.status).toBe('error');
  });

  it('signs out', async () => {
    await signOutUser(client);
    expect((await waitFor(auth, (s) => s.status === 'signedOut')).status).toBe('signedOut');
  });
});
