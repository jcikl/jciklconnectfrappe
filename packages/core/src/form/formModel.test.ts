import { describe, expect, it } from 'vitest';
import { defineDocType } from '../meta/defineDocType';
import type { FieldDef } from '../meta/types';
import { resolveDocAccess } from '../perm/access';
import type { UserContext } from '../perm/evaluate';
import { formFields, formPayload, formValues, sectionsOf, visibleFormFields, type FormField } from './formModel';

const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];

const duesRow = defineDocType({
  name: 'DuesRow',
  module: 't',
  isChild: true,
  fields: [
    { fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true },
    { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', permlevel: 1 },
    { fieldname: 'secret', label: 'Secret', fieldtype: 'Data', permlevel: 2 },
  ],
});
const person = defineDocType({
  name: 'Person',
  module: 't',
  collection: 'persons',
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data', reqd: true, section: 'Basics' },
    { fieldname: 'nickname', label: 'Nickname', fieldtype: 'Data', section: 'Basics' },
    { fieldname: 'hasCar', label: 'Has a car', fieldtype: 'Check', section: 'Extra' },
    { fieldname: 'carPlate', label: 'Car plate', fieldtype: 'Data', section: 'Extra', dependsOn: { field: 'hasCar' } },
    { fieldname: 'kind', label: 'Kind', fieldtype: 'Select', options: ['A', 'B'], section: 'Extra' },
    { fieldname: 'bNote', label: 'B note', fieldtype: 'Data', section: 'Extra', dependsOn: { field: 'kind', equals: 'B' } },
    { fieldname: 'membershipType', label: 'Type', fieldtype: 'Select', options: ['Probation', 'Official'], permlevel: 1 },
    { fieldname: 'authUid', label: 'Auth UID', fieldtype: 'Data', readOnly: true },
    { fieldname: 'internal', label: 'Internal', fieldtype: 'Data', hidden: true },
    { fieldname: 'dues', label: 'Dues', fieldtype: 'Table', childDocType: 'DuesRow' },
  ],
  permissions: [
    { role: 'Member', read: true },
    { role: 'Member', write: true, ifOwner: true },
    { role: 'Member', permlevel: 1, read: true },
    { role: 'MembershipOfficer', read: true, write: true, create: true },
    { role: 'MembershipOfficer', permlevel: 1, read: true, write: true },
    { role: 'MembershipOfficer', permlevel: 2, read: true, write: true },
    { role: 'Treasurer', create: true },
  ],
});
// Every column is readable by a Member, but `amount` is above a Member's write level.
const feeRow = defineDocType({
  name: 'FeeRow',
  module: 't',
  isChild: true,
  fields: [
    { fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true },
    { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', permlevel: 1 },
  ],
});
// `audit` is hidden and at a level nobody reads.
const noteRow = defineDocType({
  name: 'NoteRow',
  module: 't',
  isChild: true,
  fields: [
    { fieldname: 'text', label: 'Text', fieldtype: 'Data' },
    { fieldname: 'audit', label: 'Audit', fieldtype: 'Data', permlevel: 2, hidden: true },
  ],
});
const club = defineDocType({
  name: 'Club',
  module: 't',
  collection: 'clubs',
  fields: [
    { fieldname: 'title', label: 'Title', fieldtype: 'Data' },
    { fieldname: 'fees', label: 'Fees', fieldtype: 'Table', childDocType: 'FeeRow' },
    { fieldname: 'notes', label: 'Notes', fieldtype: 'Table', childDocType: 'NoteRow' },
  ],
  permissions: [
    { role: 'Member', read: true, write: true },
    { role: 'Member', permlevel: 1, read: true },
    { role: 'MembershipOfficer', read: true, write: true },
    { role: 'MembershipOfficer', permlevel: 1, read: true, write: true },
  ],
});
const resolveChild = (name: string) => {
  if (name === 'DuesRow') return duesRow;
  if (name === 'FeeRow') return feeRow;
  if (name === 'NoteRow') return noteRow;
  throw new Error(`unexpected child ${name}`);
};
const shirt: FieldDef = { fieldname: 'shirtSize', label: 'Shirt size', fieldtype: 'Data', permlevel: 1 };

const member: UserContext = { uid: 'u1', personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] };
const officer: UserContext = { uid: 'u2', personId: 'p2', grants: [{ role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true }] };
const treasurer: UserContext = { uid: 'u3', personId: 'p3', grants: [{ role: 'Treasurer', orgId: 'jci-kl', withDescendants: false }] };
const access = (user: UserContext, ownerPersonId = 'p1') =>
  resolveDocAccess({ meta: person, customFields: [shirt], user, doc: { orgPath: KL, ownerPersonId }, resolveChild });
const byKey = (fields: readonly FormField[]) => Object.fromEntries(fields.map((f) => [f.key, f]));

const stored = {
  id: 'P1',
  orgId: 'jci-kl',
  orgPath: KL,
  ownerPersonId: 'p1',
  fullName: 'Tan',
  nickname: 'AK',
  hasCar: true,
  carPlate: 'WXY 1',
  membershipType: 'Probation',
  authUid: 'abc',
  internal: 'x',
  dues: [{ year: 2025, amount: 350, secret: 's' }],
  custom: { shirtSize: 'M' },
};

describe('field-level access', () => {
  it('reports readable and editable fields from the permission rows', () => {
    const a = access(member);
    const type = person.fields.find((f) => f.fieldname === 'membershipType')!;
    const uid = person.fields.find((f) => f.fieldname === 'authUid')!;
    expect(a.canReadField(type)).toBe(true);
    expect(a.canEditField(type, false)).toBe(false);
    expect(a.canEditField(uid, false)).toBe(false);
    expect(access(officer).canEditField(type, false)).toBe(true);
    expect(a.canReadField(duesRow.fields[2]!)).toBe(false);
  });

  it('lets a create-only role fill level-0 fields on create only', () => {
    const a = access(treasurer, 'p3');
    const name = person.fields[0]!;
    expect(a.canEditField(name, true)).toBe(true);
    expect(a.canEditField(name, false)).toBe(false);
  });
});

describe('formFields', () => {
  it('lists readable, non-hidden fields with custom keys and child columns', () => {
    const fields = formFields(access(member), resolveChild, false);
    expect(fields.map((f) => f.key)).toEqual([
      'fullName',
      'nickname',
      'hasCar',
      'carPlate',
      'kind',
      'bNote',
      'membershipType',
      'authUid',
      'dues',
      'custom.shirtSize',
    ]);
    const f = byKey(fields);
    expect(f.fullName!.editable).toBe(true);
    expect(f.membershipType!.editable).toBe(false);
    expect(f.authUid!.editable).toBe(false);
    expect(f['custom.shirtSize']!.editable).toBe(false);
    // The member cannot read dues.secret, so the table is locked (see the redacted-values tests below).
    expect(f.dues!.editable).toBe(false);
    expect(f.dues!.children!.map((c) => [c.key, c.editable])).toEqual([
      ['year', false],
      ['amount', false],
    ]);
    expect(f.fullName!.children).toBeNull();
    expect(fields.every((x) => !x.rowsFixed)).toBe(true);
  });

  it('locks a table with a child column the caller cannot read, since redacted rows would null it', () => {
    const a = access(member);
    const fields = formFields(a, resolveChild, false);
    const values = formValues(fields, a.redact(stored));
    expect(values.dues).toEqual([{ year: 2025, amount: 350 }]);
    // Without the lock, sending these rows back would be refused.
    expect(a.unwritableKeys({ dues: values.dues }, stored)).toEqual(['dues.secret']);
    expect(byKey(fields).dues!.editable).toBe(false);
    expect(formPayload(fields, { ...values, dues: [{ year: 2026, amount: 350 }] }, stored)).toEqual({});
  });

  it('keeps a table editable when every column is readable, and redacted rows round-trip', () => {
    const a = access(officer, 'p1');
    const fields = formFields(a, resolveChild, false);
    expect(byKey(fields).dues!.editable).toBe(true);
    const values = formValues(fields, a.redact(stored));
    expect(formPayload(fields, values, stored)).toEqual({});
    const payload = formPayload(fields, { ...values, dues: [{ year: 2025, amount: 400, secret: 's' }] }, stored);
    expect(payload).toEqual({ dues: [{ year: 2025, amount: 400, secret: 's' }] });
    expect(a.unwritableKeys(payload, stored)).toEqual([]);
  });

  it('fixes existing rows when an editable table has a locked column', () => {
    const doc = { orgPath: KL, ownerPersonId: 'p1' };
    const clubAccess = (user: UserContext) => resolveDocAccess({ meta: club, customFields: [], user, doc, resolveChild });
    const memberFields = byKey(formFields(clubAccess(member), resolveChild, false));
    expect(memberFields.fees!.editable).toBe(true);
    expect(memberFields.fees!.children!.map((c) => [c.key, c.editable])).toEqual([
      ['year', true],
      ['amount', false],
    ]);
    expect(memberFields.fees!.rowsFixed).toBe(true);
    expect(memberFields.title!.rowsFixed).toBe(false);
    expect(memberFields.fees!.children!.every((c) => !c.rowsFixed)).toBe(true);
    const officerFields = byKey(formFields(clubAccess(officer), resolveChild, false));
    expect(officerFields.fees!.editable).toBe(true);
    expect(officerFields.fees!.rowsFixed).toBe(false);
    // On create there are no stored rows to shift, so rows are never fixed.
    const createFields = byKey(formFields(clubAccess(member), resolveChild, true));
    expect(createFields.fees!.editable).toBe(true);
    expect(createFields.fees!.rowsFixed).toBe(false);
  });

  it('locks a table on update when a hidden child column is unreadable, but not on create', () => {
    const clubAccess = resolveDocAccess({ meta: club, customFields: [], user: member, doc: { orgPath: KL, ownerPersonId: 'p1' }, resolveChild });
    const update = byKey(formFields(clubAccess, resolveChild, false));
    expect(update.notes!.editable).toBe(false);
    expect(update.notes!.children!.map((c) => [c.key, c.editable])).toEqual([['text', false]]);
    const create = byKey(formFields(clubAccess, resolveChild, true));
    expect(create.notes!.editable).toBe(true);
    expect(create.notes!.children!.map((c) => [c.key, c.editable])).toEqual([['text', true]]);
  });

  it('gives a create-only role a create form of its level-0 fields, and nothing on update', () => {
    const a = access(treasurer, 'p3');
    const create = formFields(a, resolveChild, true);
    expect(create.map((f) => [f.key, f.editable])).toEqual([
      ['fullName', true],
      ['nickname', true],
      ['hasCar', true],
      ['carPlate', true],
      ['kind', true],
      ['bNote', true],
      ['dues', true],
    ]);
    // dues is editable on create although the Treasurer reads none of its columns; only editable ones are listed.
    expect(byKey(create).dues!.children!.map((c) => [c.key, c.editable])).toEqual([['year', true]]);
    expect(formFields(a, resolveChild, false)).toEqual([]);
  });

  it('makes nothing editable for a reader without write access', () => {
    const fields = formFields(access(member, 'p9'), resolveChild, false);
    expect(fields.every((f) => !f.editable)).toBe(true);
    expect(byKey(fields).dues!.children!.every((c) => !c.editable)).toBe(true);
  });
});

describe('visibleFormFields and sectionsOf', () => {
  it('applies dependsOn and groups fields by section in order', () => {
    const fields = formFields(access(officer, 'p1'), resolveChild, false);
    const hidden = visibleFormFields(fields, { hasCar: false, kind: 'A' }).map((f) => f.key);
    expect(hidden).not.toContain('carPlate');
    expect(hidden).not.toContain('bNote');
    const shown = visibleFormFields(fields, { hasCar: true, kind: 'B' }).map((f) => f.key);
    expect(shown).toContain('carPlate');
    expect(shown).toContain('bNote');
    expect(sectionsOf(fields).map((s) => [s.title, s.fields.length])).toEqual([
      ['Basics', 2],
      ['Extra', 4],
      [null, 4],
    ]);
  });
});

describe('formValues and formPayload', () => {
  const officerFields = formFields(access(officer, 'p1'), resolveChild, false);

  it('reads flat values, with null for missing and copies of child rows', () => {
    const values = formValues(officerFields, stored);
    expect(values).toMatchObject({ fullName: 'Tan', kind: null, 'custom.shirtSize': 'M', dues: [{ year: 2025, amount: 350, secret: 's' }] });
    expect(values.dues).not.toBe(stored.dues);
    expect(formValues(officerFields, null)).toMatchObject({ fullName: null, dues: [] });
  });

  it('sends only editable fields that changed on update, with custom values nested', () => {
    const values = { ...formValues(officerFields, stored), nickname: 'Ah Kow', authUid: 'hacked', 'custom.shirtSize': 'L' };
    expect(formPayload(officerFields, values, stored)).toEqual({ nickname: 'Ah Kow', custom: { shirtSize: 'L' } });
    expect(formPayload(officerFields, formValues(officerFields, stored), stored)).toEqual({});
  });

  it('sends every non-empty editable field on create and turns optional blanks into omissions', () => {
    const createFields = formFields(access(officer, 'p2'), resolveChild, true);
    const values = { ...formValues(createFields, null), fullName: 'New', nickname: '', kind: 'A', dues: [{ year: 2026 }] };
    expect(formPayload(createFields, values, null)).toEqual({ fullName: 'New', kind: 'A', dues: [{ year: 2026 }] });
  });

  it('keeps an empty required value so validation can report it', () => {
    const createFields = formFields(access(officer, 'p2'), resolveChild, true);
    expect(formPayload(createFields, { ...formValues(createFields, null), fullName: '' }, null)).toMatchObject({ fullName: '' });
  });

  it('sends a changed child table as complete rows', () => {
    // The officer reads every DuesRow column, so the redacted rows they hold are complete.
    const held = formValues(officerFields, access(officer, 'p1').redact(stored));
    const values = { ...held, dues: [{ ...(held.dues as Record<string, unknown>[])[0], amount: 400 }] };
    expect(formPayload(officerFields, values, stored)).toEqual({ dues: [{ year: 2025, amount: 400, secret: 's' }] });
  });

  it('does not send an untouched empty table on create', () => {
    const createFields = formFields(access(officer, 'p2'), resolveChild, true);
    expect(byKey(createFields).dues!.editable).toBe(true);
    expect(formPayload(createFields, { ...formValues(createFields, null), fullName: 'New' }, null)).toEqual({ fullName: 'New' });
  });

  it('does not send an empty table on update when the stored table is missing or null', () => {
    const missing: Record<string, unknown> = { ...stored };
    delete missing.dues;
    expect(formPayload(officerFields, formValues(officerFields, missing), missing)).toEqual({});
    const nulled = { ...stored, dues: null };
    expect(formPayload(officerFields, formValues(officerFields, nulled), nulled)).toEqual({});
  });

  it('treats a stored optional blank as null, so an untouched one is not a change', () => {
    const before = { ...stored, nickname: '' };
    expect(formPayload(officerFields, formValues(officerFields, before), before)).toEqual({});
    expect(formPayload(officerFields, { ...formValues(officerFields, before), nickname: 'AK' }, before)).toEqual({ nickname: 'AK' });
  });
});
