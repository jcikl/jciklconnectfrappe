import { describe, expect, it } from 'vitest';
import { mergeCustomFields } from '../meta/customFields';
import { defineDocType } from '../meta/defineDocType';
import { can, effectiveRoles, grantApplies, patchKeys, readableFields, unwritableKeys, type UserContext } from './evaluate';

const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];
const PJ = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-pj'];
const SG = ['jci', 'jci-asia-pacific', 'jci-singapore', 'jci-sg-local'];

const person = defineDocType({
  name: 'Person',
  module: 'membership',
  collection: 'persons',
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data' },
    { fieldname: 'phone', label: 'Phone', fieldtype: 'Data' },
    { fieldname: 'membershipType', label: 'Type', fieldtype: 'Select', options: ['Probation', 'Official'], permlevel: 1 },
    { fieldname: 'authUid', label: 'Auth UID', fieldtype: 'Data', readOnly: true },
  ],
  permissions: [
    { role: 'Member', read: true },
    { role: 'Member', write: true, ifOwner: true },
    { role: 'Member', permlevel: 1, read: true },
    { role: 'MembershipOfficer', read: true, write: true, create: true },
    { role: 'MembershipOfficer', permlevel: 1, read: true, write: true },
  ],
});

const member: UserContext = { uid: 'u1', personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] };
const nationalOfficer: UserContext = {
  uid: 'u2',
  personId: 'p2',
  grants: [{ role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true }],
};
const klDoc = { orgPath: KL, ownerPersonId: 'p9' };
const ownDoc = { orgPath: KL, ownerPersonId: 'p1' };

describe('grant scope', () => {
  it('applies to own org, or the subtree when withDescendants', () => {
    expect(grantApplies({ role: 'Member', orgId: 'jci-kl', withDescendants: false }, KL)).toBe(true);
    expect(grantApplies({ role: 'Member', orgId: 'jci-malaysia', withDescendants: false }, KL)).toBe(false);
    expect(grantApplies({ role: 'Member', orgId: 'jci-malaysia', withDescendants: true }, KL)).toBe(true);
    expect(grantApplies({ role: 'Member', orgId: 'jci-malaysia', withDescendants: true }, SG)).toBe(false);
    expect(grantApplies({ role: 'Member', orgId: 'jci', withDescendants: true }, [])).toBe(false);
  });

  it('collects effective roles for a document', () => {
    expect([...effectiveRoles(nationalOfficer, klDoc)]).toEqual(['MembershipOfficer']);
    expect(effectiveRoles(member, { orgPath: PJ }).size).toBe(0);
  });
});

describe('can', () => {
  it('lets members read their own local but not another local', () => {
    expect(can(person, member, 'read', klDoc)).toBe(true);
    expect(can(person, member, 'read', { orgPath: PJ })).toBe(false);
  });

  it('lets a national officer act on every local below the national org only', () => {
    expect(can(person, nationalOfficer, 'write', klDoc)).toBe(true);
    expect(can(person, nationalOfficer, 'create', { orgPath: PJ })).toBe(true);
    expect(can(person, nationalOfficer, 'read', { orgPath: SG })).toBe(false);
    expect(can(person, nationalOfficer, 'delete', klDoc)).toBe(false);
  });

  it('applies ifOwner rows only to the owner', () => {
    expect(can(person, member, 'write', ownDoc)).toBe(true);
    expect(can(person, member, 'write', klDoc)).toBe(false);
    const anonymous: UserContext = { ...member, personId: null };
    expect(can(person, anonymous, 'write', { orgPath: KL, ownerPersonId: null })).toBe(false);
  });
});

describe('field-level permissions', () => {
  it('blocks permlevel-1 and readOnly fields for members', () => {
    expect(unwritableKeys(person, person.fields, member, ownDoc, { fullName: 'A', membershipType: 'Official' })).toEqual(['membershipType']);
    expect(unwritableKeys(person, person.fields, member, ownDoc, { phone: '012' })).toEqual([]);
  });

  it('allows permlevel-1 for officers but never readOnly fields', () => {
    expect(unwritableKeys(person, person.fields, nationalOfficer, klDoc, { membershipType: 'Official' })).toEqual([]);
    expect(unwritableKeys(person, person.fields, nationalOfficer, klDoc, { authUid: 'x' })).toEqual(['authUid']);
  });

  it('checks custom fields via custom.<name> keys', () => {
    const fields = mergeCustomFields(person, [{ fieldname: 'shirtSize', label: 'Shirt', fieldtype: 'Data', permlevel: 1 }]);
    expect(patchKeys({ fullName: 'A', custom: { shirtSize: 'L' } })).toEqual(['fullName', 'custom.shirtSize']);
    expect(unwritableKeys(person, fields, member, ownDoc, { custom: { shirtSize: 'L' } })).toEqual(['custom.shirtSize']);
  });

  it('returns readable fields by permlevel', () => {
    const outsider: UserContext = { uid: 'u3', personId: 'p3', grants: [{ role: 'Member', orgId: 'jci-pj', withDescendants: false }] };
    expect(readableFields(person, person.fields, member, klDoc).map((f) => f.fieldname)).toEqual([
      'fullName',
      'phone',
      'membershipType',
      'authUid',
    ]);
    expect(readableFields(person, person.fields, outsider, klDoc)).toEqual([]);
  });
});
