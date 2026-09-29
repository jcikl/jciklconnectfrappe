import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  buildUserAccess,
  defineDocType,
  generateFirestoreRules,
  listFilters,
  scopeOptions,
  userContextFromAccess,
  type DocTypeMeta,
  type ListFilter,
  type RoleGrant,
} from '@jci/core';
import { CustomField, DOCTYPES, Organization, orgDocs, RoleAssignment } from '@jci/doctypes';
import type firebase from 'firebase/compat/app';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { KL, PJ, TEST_ORGS } from './fixtures';
import { requireEmulators } from './helpers';

const PersonalNote = defineDocType({
  name: 'PersonalNote',
  module: 'test',
  collection: 'personalNotes',
  fields: [{ fieldname: 'title', label: 'Title', fieldtype: 'Data' }],
  permissions: [
    { role: 'Member', read: true, ifOwner: true },
    { role: 'MembershipOfficer', read: true },
  ],
});

const grant = (role: RoleGrant['role'], orgId: string, withDescendants = false): RoleGrant => ({ role, orgId, withDescendants });
const ACCESS = {
  'member-kl': buildUserAccess('member-kl', 'p-kl', [grant('Member', 'jci-kl')]),
  'officer-my': buildUserAccess('officer-my', 'p-my', [grant('MembershipOfficer', 'jci-malaysia', true)]),
  'admin-pj': buildUserAccess('admin-pj', null, [grant('OrgAdmin', 'jci-pj')]),
};
type Uid = keyof typeof ACCESS;

let env: RulesTestEnvironment;

async function list(uid: Uid, meta: DocTypeMeta, filters: readonly ListFilter[]): Promise<string[]> {
  let q: firebase.firestore.Query = env.authenticatedContext(uid).firestore().collection(meta.collection);
  for (const f of filters) q = q.where(f.field, f.op, f.value);
  const snap = await assertSucceeds(q.get());
  return snap.docs.map((d) => d.id).sort();
}

/** Filters for the user's first (widest) scope option. */
function filtersFor(uid: Uid, meta: DocTypeMeta): ListFilter[] | null {
  const user = userContextFromAccess(ACCESS[uid], uid);
  return listFilters(meta, user, scopeOptions(user)[0] ?? null);
}

beforeAll(async () => {
  requireEmulators();
  env = await initializeTestEnvironment({
    projectId: 'demo-jci-scope',
    firestore: { rules: generateFirestoreRules([...DOCTYPES, PersonalNote]) },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const inOrg = (orgPath: string[], ownerPersonId: string | null = null) => ({ orgId: orgPath[orgPath.length - 1], orgPath, ownerPersonId });
    for (const o of orgDocs(TEST_ORGS)) await db.collection('organizations').doc(String(o.id)).set(o);
    for (const [uid, access] of Object.entries(ACCESS)) await db.collection('userAccess').doc(uid).set(access);
    await db.collection('roleAssignments').doc('ra-kl').set({ uid: 'member-kl', role: 'Member', ...inOrg(KL) });
    await db.collection('roleAssignments').doc('ra-pj').set({ uid: 'admin-pj', role: 'OrgAdmin', ...inOrg(PJ) });
    await db.collection('customFields').doc('Organization.motto').set({ targetDocType: 'Organization', fieldname: 'motto', org: 'jci' });
    await db.collection('personalNotes').doc('n-kl-mine').set({ title: 'Mine', ...inOrg(KL, 'p-kl') });
    await db.collection('personalNotes').doc('n-kl-other').set({ title: 'Other', ...inOrg(KL, 'p-other') });
    await db.collection('personalNotes').doc('n-pj-mine').set({ title: 'Mine in PJ', ...inOrg(PJ, 'p-kl') });
  });
});

afterAll(() => env?.cleanup());

describe('list filters satisfy the generated rules', () => {
  it('lets a member list only their own local', async () => {
    const filters = filtersFor('member-kl', Organization);
    expect(filters).toEqual([{ field: 'orgId', op: '==', value: 'jci-kl' }]);
    expect(await list('member-kl', Organization, filters!)).toEqual(['jci-kl']);
  });

  it('lets a national officer list the whole national subtree', async () => {
    const filters = filtersFor('officer-my', Organization);
    expect(await list('officer-my', Organization, filters!)).toEqual(['jci-kl', 'jci-malaysia', 'jci-malaysia-central', 'jci-pj']);
  });

  it('lets an org admin list role assignments at their org, and hides them from members', async () => {
    expect(await list('admin-pj', RoleAssignment, filtersFor('admin-pj', RoleAssignment)!)).toEqual(['ra-pj']);
    expect(filtersFor('member-kl', RoleAssignment)).toBeNull();
  });

  it('lists global DocTypes without an org filter', async () => {
    expect(filtersFor('member-kl', CustomField)).toEqual([]);
    expect(await list('member-kl', CustomField, [])).toEqual(['Organization.motto']);
  });

  it('proves owner-only reads with the owner filter', async () => {
    const filters = filtersFor('member-kl', PersonalNote);
    expect(filters).toEqual([
      { field: 'orgId', op: '==', value: 'jci-kl' },
      { field: 'ownerPersonId', op: '==', value: 'p-kl' },
    ]);
    expect(await list('member-kl', PersonalNote, filters!)).toEqual(['n-kl-mine']);
    expect(await list('officer-my', PersonalNote, filtersFor('officer-my', PersonalNote)!)).toEqual(['n-kl-mine', 'n-kl-other', 'n-pj-mine']);
  });

  it('shows the rules reject a list without the owner filter', async () => {
    const q = env.authenticatedContext('member-kl').firestore().collection('personalNotes').where('orgId', '==', 'jci-kl');
    await assertFails(q.get());
  });
});
