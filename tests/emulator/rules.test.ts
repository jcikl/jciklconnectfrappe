import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { buildUserAccess, type RoleGrant, type RoleName } from '@jci/core';
import { orgDocs } from '@jci/doctypes';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { KL, PJ, TEST_ORGS } from './fixtures';
import { requireEmulators } from './helpers';

let env: RulesTestEnvironment;
const grant = (role: RoleName, orgId: string, withDescendants = false): RoleGrant => ({ role, orgId, withDescendants });
const ACCESS = {
  'member-kl': buildUserAccess('member-kl', 'p-kl', [grant('Member', 'jci-kl')]),
  'officer-my': buildUserAccess('officer-my', 'p-my', [grant('MembershipOfficer', 'jci-malaysia', true)]),
  'admin-pj': buildUserAccess('admin-pj', null, [grant('OrgAdmin', 'jci-pj')]),
};
const as = (uid: string) => env.authenticatedContext(uid).firestore();

beforeAll(async () => {
  requireEmulators();
  env = await initializeTestEnvironment({
    projectId: 'demo-jci-rules',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const org of orgDocs(TEST_ORGS)) await db.collection('organizations').doc(String(org.id)).set(org);
    for (const [uid, access] of Object.entries(ACCESS)) await db.collection('userAccess').doc(uid).set(access);
    const inOrg = (orgPath: string[]) => ({ orgId: orgPath[orgPath.length - 1], orgPath, ownerPersonId: null });
    await db.collection('roleAssignments').doc('ra-kl').set({ uid: 'member-kl', role: 'Member', ...inOrg(KL) });
    await db.collection('roleAssignments').doc('ra-pj').set({ uid: 'admin-pj', role: 'OrgAdmin', ...inOrg(PJ) });
    await db
      .collection('customFields')
      .doc('Organization.motto')
      .set({ targetDocType: 'Organization', fieldname: 'motto', label: 'Motto', fieldtype: 'Data', org: 'jci-malaysia', ownerPersonId: null });
    const version = { doctype: 'Organization', action: 'update', changed: [], by: 'x' };
    await db.collection('versions').doc('v-kl').set({ ...version, docId: 'jci-kl', ...inOrg(KL) });
    await db.collection('versions').doc('v-pj').set({ ...version, docId: 'jci-pj', ...inOrg(PJ) });
  });
});

afterAll(() => env?.cleanup());

describe('org-scoped reads', () => {
  it('lets a member read their own local only', async () => {
    await assertSucceeds(as('member-kl').collection('organizations').doc('jci-kl').get());
    await assertFails(as('member-kl').collection('organizations').doc('jci-pj').get());
    await assertFails(as('member-kl').collection('organizations').doc('jci-malaysia').get());
  });

  it('lets a national officer read the whole national subtree', async () => {
    for (const id of ['jci-malaysia', 'jci-malaysia-central', 'jci-kl', 'jci-pj']) {
      await assertSucceeds(as('officer-my').collection('organizations').doc(id).get());
    }
    await assertFails(as('officer-my').collection('organizations').doc('jci-singapore').get());
  });

  it('keeps role assignments private to administrators of the org', async () => {
    await assertFails(as('member-kl').collection('roleAssignments').doc('ra-kl').get());
    await assertSucceeds(as('admin-pj').collection('roleAssignments').doc('ra-pj').get());
    await assertFails(as('admin-pj').collection('roleAssignments').doc('ra-kl').get());
  });

  it('reads versions under the same rules as their document', async () => {
    await assertSucceeds(as('member-kl').collection('versions').doc('v-kl').get());
    await assertFails(as('member-kl').collection('versions').doc('v-pj').get());
  });

  it('lets any role holder read global DocTypes, and nobody else', async () => {
    await assertSucceeds(as('member-kl').collection('customFields').doc('Organization.motto').get());
    await assertFails(as('nobody').collection('customFields').doc('Organization.motto').get());
    await assertFails(env.unauthenticatedContext().firestore().collection('customFields').doc('Organization.motto').get());
  });
});

describe('list queries', () => {
  it('allow a member to list their exact org', async () => {
    await assertSucceeds(as('member-kl').collection('organizations').where('orgId', '==', 'jci-kl').get());
  });

  // Known risk (see "Decisions"): if this fails, stop and report instead of loosening the rules.
  it('allow an officer to list the subtree they cover', async () => {
    await assertSucceeds(as('officer-my').collection('organizations').where('orgPath', 'array-contains', 'jci-malaysia').get());
  });

  it('deny a list that could include orgs outside the caller scope', async () => {
    await assertFails(as('member-kl').collection('organizations').where('orgPath', 'array-contains', 'jci-malaysia').get());
    await assertFails(as('member-kl').collection('organizations').get());
  });
});

describe('writes and userAccess', () => {
  it('deny every client write', async () => {
    await assertFails(as('officer-my').collection('organizations').doc('jci-kl').set({ title: 'Hacked' }));
    await assertFails(as('admin-pj').collection('roleAssignments').doc('new').set({ uid: 'admin-pj', role: 'SystemManager' }));
    await assertFails(as('member-kl').collection('versions').add({ doctype: 'Organization' }));
    await assertFails(as('member-kl').collection('userAccess').doc('member-kl').set({ scopes: {} }));
    await assertFails(as('member-kl').collection('series').doc('PER-2026-').set({ current: 0 }));
  });

  it('let users read only their own userAccess', async () => {
    await assertSucceeds(as('member-kl').collection('userAccess').doc('member-kl').get());
    await assertFails(as('member-kl').collection('userAccess').doc('officer-my').get());
  });
});
