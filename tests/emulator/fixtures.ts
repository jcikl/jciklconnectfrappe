import { createRegistry, defineDocType, type RoleName, type UserContext } from '@jci/core';
import { DOCTYPES, orgDocs, SEED_ORGS, type SeedOrg } from '@jci/doctypes';
import type { Firestore } from 'firebase-admin/firestore';

/** 10:00 on 29 Sep 2026 in Kuala Lumpur. */
export const NOW = new Date('2026-09-29T02:00:00Z');
export const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];
export const PJ = [...KL.slice(0, 4), 'jci-pj'];

export const TEST_ORGS: readonly SeedOrg[] = [
  ...SEED_ORGS,
  { code: 'jci-pj', title: 'JCI Petaling Jaya', level: 'local', parent: 'jci-malaysia-central' },
  { code: 'jci-singapore', title: 'JCI Singapore', level: 'national', parent: 'jci-asia-pacific' },
];

export async function seedOrgs(db: Firestore): Promise<void> {
  const batch = db.batch();
  for (const o of orgDocs(TEST_ORGS)) batch.set(db.collection('organizations').doc(String(o.id)), o);
  await batch.commit();
}

export async function putDoc(db: Firestore, collection: string, id: string, data: Record<string, unknown>): Promise<void> {
  await db.collection(collection).doc(id).set({ id, ...data });
}

function user(uid: string, personId: string | null, ...grants: [RoleName, string, boolean][]): UserContext {
  return { uid, personId, grants: grants.map(([role, orgId, withDescendants]) => ({ role, orgId, withDescendants })) };
}

export const users = {
  admin: user('u-admin', 'p-admin', ['SystemManager', 'jci', true]),
  officer: user('u-officer', 'p-officer', ['MembershipOfficer', 'jci-malaysia', true]),
  member: user('u-member', 'p1', ['Member', 'jci-kl', false]),
  outsider: user('u-outsider', 'p-outsider', ['Member', 'jci-pj', false]),
  pjAdmin: user('u-pjadmin', null, ['OrgAdmin', 'jci-pj', false]),
};

export const PersonHistory = defineDocType({
  name: 'PersonHistory',
  module: 'test',
  isChild: true,
  fields: [
    { fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true },
    { fieldname: 'verified', label: 'Verified', fieldtype: 'Check', readOnly: true },
    { fieldname: 'org', label: 'Org', fieldtype: 'Link', link: 'Organization' },
  ],
});

/** Test-only DocType standing in for M4's Person. */
export const Person = defineDocType({
  name: 'Person',
  module: 'test',
  collection: 'persons',
  naming: { kind: 'series', pattern: 'PER-.YYYY.-.#####' },
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data', reqd: true },
    { fieldname: 'email', label: 'Email', fieldtype: 'Data', unique: true },
    { fieldname: 'phone', label: 'Phone', fieldtype: 'Data' },
    { fieldname: 'membershipType', label: 'Type', fieldtype: 'Select', options: ['Probation', 'Official'], permlevel: 1 },
    { fieldname: 'authUid', label: 'Auth UID', fieldtype: 'Data', readOnly: true },
    { fieldname: 'mentor', label: 'Mentor', fieldtype: 'Link', link: 'Person' },
    { fieldname: 'history', label: 'History', fieldtype: 'Table', childDocType: 'PersonHistory' },
  ],
  permissions: [
    { role: 'Member', read: true },
    { role: 'Member', write: true, ifOwner: true },
    { role: 'Member', permlevel: 1, read: true },
    { role: 'MembershipOfficer', read: true, write: true, create: true, delete: true },
    { role: 'MembershipOfficer', permlevel: 1, read: true, write: true },
    { role: 'SystemManager', read: true, write: true, create: true, delete: true },
  ],
});

export const testRegistry = createRegistry([...DOCTYPES, Person, PersonHistory]);
