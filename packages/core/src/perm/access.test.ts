import { describe, expect, it } from 'vitest';
import { defineDocType } from '../meta/defineDocType';
import type { FieldDef } from '../meta/types';
import { getFieldValue, redactDoc, resolveDocAccess } from './access';
import { can, type DocContext, type UserContext } from './evaluate';

const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];

const duesRow = defineDocType({
  name: 'DuesRow',
  module: 't',
  isChild: true,
  fields: [
    { fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true },
    { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', permlevel: 1 },
    { fieldname: 'verified', label: 'Verified', fieldtype: 'Check', readOnly: true },
  ],
});
const person = defineDocType({
  name: 'Person',
  module: 't',
  collection: 'persons',
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data', reqd: true },
    { fieldname: 'membershipType', label: 'Type', fieldtype: 'Select', options: ['Probation', 'Official'], permlevel: 1 },
    { fieldname: 'authUid', label: 'Auth UID', fieldtype: 'Data', readOnly: true },
    { fieldname: 'dues', label: 'Dues', fieldtype: 'Table', childDocType: 'DuesRow' },
  ],
  permissions: [
    { role: 'Member', read: true },
    { role: 'Member', write: true, ifOwner: true },
    { role: 'Member', permlevel: 1, read: true },
    { role: 'MembershipOfficer', read: true, write: true, create: true },
    { role: 'MembershipOfficer', permlevel: 1, read: true, write: true },
    { role: 'Treasurer', create: true },
  ],
});
const resolveChild = (name: string) => {
  if (name === 'DuesRow') return duesRow;
  throw new Error(`unexpected child ${name}`);
};

const member: UserContext = { uid: 'u1', personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] };
const officer: UserContext = {
  uid: 'u2',
  personId: 'p2',
  grants: [{ role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true }],
};
const treasurer: UserContext = { uid: 'u3', personId: 'p3', grants: [{ role: 'Treasurer', orgId: 'jci-kl', withDescendants: false }] };
const own: DocContext = { orgPath: KL, ownerPersonId: 'p1' };
const access = (user: UserContext, doc: DocContext = own, customFields: readonly FieldDef[] = []) =>
  resolveDocAccess({ meta: person, customFields, user, doc, resolveChild });

const before = {
  id: 'P1',
  orgId: 'jci-kl',
  orgPath: KL,
  ownerPersonId: 'p1',
  fullName: 'Tan',
  membershipType: 'Probation',
  authUid: 'abc',
  dues: [{ year: 2025, amount: 350, verified: true }],
  custom: { shirtSize: 'M' },
};

describe('global DocTypes', () => {
  it('apply a role held anywhere when orgPath is null', () => {
    const setting = defineDocType({
      name: 'Setting',
      module: 't',
      collection: 'settings',
      orgScoped: false,
      fields: [{ fieldname: 'value', label: 'Value', fieldtype: 'Data' }],
      permissions: [{ role: 'Member', read: true }],
    });
    expect(can(setting, member, 'read', { orgPath: null })).toBe(true);
    expect(can(setting, { uid: 'u9', personId: null, grants: [] }, 'read', { orgPath: null })).toBe(false);
    expect(can(person, member, 'read', { orgPath: [] })).toBe(false);
  });
});

describe('resolveDocAccess', () => {
  it('summarises document-level access', () => {
    const a = access(member);
    expect([a.canRead, a.canWrite, a.canCreate, a.canDelete]).toEqual([true, true, false, false]);
    expect(access(officer).canCreate).toBe(true);
  });

  it('rejects only locked fields whose value changes', () => {
    const a = access(member);
    expect(a.unwritableKeys({ fullName: 'Tan Ah Kow', membershipType: 'Probation', authUid: 'abc' }, before)).toEqual([]);
    expect(a.unwritableKeys({ membershipType: 'Official', authUid: 'xyz' }, before)).toEqual(['membershipType', 'authUid']);
  });

  it('treats every non-null locked value as a change on create', () => {
    const a = access(officer, { orgPath: KL, ownerPersonId: 'p2' });
    expect(a.unwritableKeys({ fullName: 'New', membershipType: 'Official', authUid: null }, null)).toEqual([]);
    expect(a.unwritableKeys({ fullName: 'New', authUid: 'x' }, null)).toEqual(['authUid']);
  });

  it('lets create-only roles fill level-0 fields', () => {
    const a = access(treasurer, { orgPath: KL, ownerPersonId: 'p3' });
    expect(a.canCreate).toBe(true);
    expect(a.unwritableKeys({ fullName: 'New' }, null)).toEqual([]);
    expect(a.unwritableKeys({ fullName: 'New', membershipType: 'Official' }, null)).toEqual(['membershipType']);
  });

  it('checks locked child-table fields row by row', () => {
    const m = access(member);
    const o = access(officer, { orgPath: KL, ownerPersonId: 'p1' });
    expect(m.unwritableKeys({ dues: [{ year: 2025, amount: 350, verified: true }] }, before)).toEqual([]);
    expect(m.unwritableKeys({ dues: [{ year: 2026, amount: 350, verified: true }] }, before)).toEqual([]);
    expect(m.unwritableKeys({ dues: [{ year: 2025, amount: 1, verified: true }] }, before)).toEqual(['dues.amount']);
    expect(o.unwritableKeys({ dues: [{ year: 2025, amount: 1, verified: true }] }, before)).toEqual([]);
    expect(
      o.unwritableKeys({ dues: [{ year: 2025, amount: 350, verified: true }, { year: 2026, verified: true }] }, before),
    ).toEqual(['dues.verified']);
  });

  it('treats removed child rows as changes to their locked fields', () => {
    expect(access(member).unwritableKeys({ dues: [] }, before)).toEqual(['dues.amount', 'dues.verified']);
    expect(access(officer, { orgPath: KL, ownerPersonId: 'p1' }).unwritableKeys({ dues: [] }, before)).toEqual(['dues.verified']);
  });

  it('denies an org-scoped doc that has no orgPath', () => {
    const a = access(member, { orgPath: null, ownerPersonId: 'p1' });
    expect(a.canRead).toBe(false);
    expect(a.readableFields).toEqual([]);
  });

  it('checks custom fields and builds each schema once', () => {
    const customFields: FieldDef[] = [{ fieldname: 'shirtSize', label: 'Shirt', fieldtype: 'Data', permlevel: 1 }];
    const a = access(member, own, customFields);
    expect(a.fields.map((f) => f.fieldname)).toContain('shirtSize');
    expect(a.unwritableKeys({ custom: { shirtSize: 'M' } }, before)).toEqual([]);
    expect(a.unwritableKeys({ custom: { shirtSize: 'L' } }, before)).toEqual(['custom.shirtSize']);
    expect(a.schema('update')).toBe(a.schema('update'));
    expect(a.schema('create').safeParse({ fullName: 'A', custom: { shirtSize: 'L' } }).success).toBe(true);
  });

  it('lists readable fields', () => {
    const outsider: UserContext = { uid: 'u4', personId: null, grants: [{ role: 'Member', orgId: 'jci-pj', withDescendants: false }] };
    expect(access(outsider).readableFields).toEqual([]);
    expect(access(member).readableFields.map((f) => f.fieldname)).toEqual(['fullName', 'membershipType', 'authUid', 'dues']);
  });
});

describe('redact', () => {
  it('drops child fields above the caller read permlevels', () => {
    const boardMeta = { ...person, permissions: [...person.permissions, { role: 'BoardMember' as const, read: true }] };
    const board: UserContext = { uid: 'u5', personId: 'p5', grants: [{ role: 'BoardMember', orgId: 'jci-kl', withDescendants: false }] };
    const b = resolveDocAccess({ meta: boardMeta, customFields: [], user: board, doc: own, resolveChild });
    expect(b.redact(before).dues).toEqual([{ year: 2025, verified: true }]);
    expect(access(member).redact(before).dues).toEqual([{ year: 2025, amount: 350, verified: true }]);
  });
});

describe('getFieldValue and redactDoc', () => {
  it('reads core and custom values, defaulting to null', () => {
    expect(getFieldValue(before, 'fullName')).toBe('Tan');
    expect(getFieldValue(before, 'custom.shirtSize')).toBe('M');
    expect(getFieldValue(before, 'custom.missing')).toBeNull();
    expect(getFieldValue(null, 'fullName')).toBeNull();
  });

  it('keeps system fields and readable fields only', () => {
    const readable: FieldDef[] = [
      ...person.fields.filter((f) => f.fieldname === 'fullName'),
      { fieldname: 'shirtSize', label: 'Shirt', fieldtype: 'Data', isCustom: true },
    ];
    expect(redactDoc(before, readable)).toEqual({
      id: 'P1',
      orgId: 'jci-kl',
      orgPath: KL,
      ownerPersonId: 'p1',
      fullName: 'Tan',
      custom: { shirtSize: 'M' },
    });
  });
});
