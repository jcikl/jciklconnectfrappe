import { createCustomFieldsStore, createVersionsStore, initClient, signInWithEmail, signOutUser, timelineEntries, type DocsState, type Store } from '@jci/client';
import { buildUserAccess, filtersForDoc } from '@jci/core';
import { Organization } from '@jci/doctypes';
import { deleteApp } from 'firebase/app';
import { Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KL, PJ, seedOrgs } from './fixtures';
import { clearAuth, requireEmulators, signUp, testProject } from './helpers';

// Sign-up tokens come from the Auth emulator's default project, so this file uses demo-jci (files run one at a time).
const admin = testProject('demo-jci');
const client = initClient({
  projectId: 'demo-jci',
  apiKey: 'demo-api-key',
  emulatorHost: requireEmulators().firestoreHost.split(':')[0]!,
  apiBaseUrl: 'http://localhost:8888',
  appName: 'form-data-test',
});
const EMAIL = 'form-member@jci.test';
const member = { uid: '', personId: 'p-member', grants: [{ role: 'Member' as const, orgId: 'jci-kl', withDescendants: false }] };

function settle(store: Store<DocsState>): Promise<DocsState> {
  return new Promise((resolve) => {
    const check = () => {
      const s = store.getSnapshot();
      if (s.status === 'loading') return;
      queueMicrotask(() => unsubscribe());
      resolve(s);
    };
    const unsubscribe = store.subscribe(check);
    check();
  });
}

beforeAll(async () => {
  await admin.clear();
  await clearAuth(admin.projectId);
  await seedOrgs(admin.db);
  ({ uid: member.uid } = await signUp(EMAIL));
  await admin.db.collection('userAccess').doc(member.uid).set(buildUserAccess(member.uid, member.personId, member.grants));
  const version = (docId: string, orgPath: string[], at: string, title: string) => ({
    doctype: 'Organization',
    docId,
    action: 'update',
    by: 'u-admin',
    at: Timestamp.fromDate(new Date(at)),
    changed: [{ field: 'title', old: 'Old', new: title }],
    orgId: orgPath[orgPath.length - 1],
    orgPath,
    ownerPersonId: null,
  });
  await admin.db.collection('versions').doc('v1').set(version('jci-kl', KL, '2026-09-01T00:00:00Z', 'First'));
  await admin.db.collection('versions').doc('v2').set(version('jci-kl', KL, '2026-09-29T00:00:00Z', 'Second'));
  await admin.db.collection('versions').doc('v3').set(version('jci-pj', PJ, '2026-09-29T00:00:00Z', 'PJ'));
  await admin.db
    .collection('customFields')
    .doc('Organization.motto')
    .set({ targetDocType: 'Organization', fieldname: 'motto', label: 'Motto', fieldtype: 'Data', org: 'jci-malaysia' });
  await admin.db
    .collection('customFields')
    .doc('RoleAssignment.note')
    .set({ targetDocType: 'RoleAssignment', fieldname: 'note', label: 'Note', fieldtype: 'Data', org: 'jci' });
  await signInWithEmail(client, EMAIL, 'emulator-only-password');
});

afterAll(async () => {
  await signOutUser(client).catch(() => {});
  await deleteApp(client.app);
  await admin.close();
});

describe('form data stores against the generated rules', () => {
  it('lists a document versions with the filters for that document, newest first', async () => {
    const filters = filtersForDoc(Organization, member, { orgId: 'jci-kl', orgPath: KL })!;
    const state = await settle(createVersionsStore(client.db, 'Organization', 'jci-kl', filters));
    expect(state.status).toBe('ready');
    const entries = timelineEntries(state.status === 'ready' ? state.docs : [], { title: 'Name' });
    expect(entries.map((e) => e.changes[0]!.to)).toEqual(['Second', 'First']);
  });

  it('has no filters for a document outside the caller scope, and the rules deny a guessed query', async () => {
    expect(filtersForDoc(Organization, member, { orgId: 'jci-pj', orgPath: PJ })).toBeNull();
    const guessed = await settle(createVersionsStore(client.db, 'Organization', 'jci-pj', [{ field: 'orgId', op: '==', value: 'jci-pj' }]));
    expect(guessed.status).toBe('error');
  });

  it('loads the custom field definitions for one DocType', async () => {
    const state = await settle(createCustomFieldsStore(client.db, 'customFields', 'Organization'));
    expect(state.status === 'ready' && state.docs.map((d) => d.id)).toEqual(['Organization.motto']);
  });
});
