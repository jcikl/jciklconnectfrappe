import { describe, expect, it } from 'vitest';
import { MetaError } from '../errors';
import { defineDocType } from '../meta/defineDocType';
import { buildSchema } from './buildSchema';

const historyRow = defineDocType({
  name: 'MemberHistory',
  module: 't',
  isChild: true,
  fields: [
    { fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true },
    { fieldname: 'note', label: 'Note', fieldtype: 'Text' },
  ],
});
const member = defineDocType({
  name: 'Member',
  module: 't',
  collection: 'members',
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data', reqd: true },
    { fieldname: 'age', label: 'Age', fieldtype: 'Int' },
    { fieldname: 'gender', label: 'Gender', fieldtype: 'Select', options: ['Male', 'Female'] },
    { fieldname: 'dues', label: 'Dues', fieldtype: 'Currency' },
    { fieldname: 'joinDate', label: 'Join date', fieldtype: 'Date' },
    { fieldname: 'lastSeen', label: 'Last seen', fieldtype: 'Datetime' },
    { fieldname: 'active', label: 'Active', fieldtype: 'Check' },
    { fieldname: 'avatar', label: 'Avatar', fieldtype: 'AttachImage' },
    { fieldname: 'extra', label: 'Extra', fieldtype: 'JSON' },
    { fieldname: 'homeOrg', label: 'Org', fieldtype: 'Link', link: 'Organization' },
    { fieldname: 'history', label: 'History', fieldtype: 'Table', childDocType: 'MemberHistory' },
  ],
});
const resolveChild = (name: string) => {
  if (name === 'MemberHistory') return historyRow;
  throw new Error(`unexpected child ${name}`);
};
const create = buildSchema(member, { resolveChild });
const update = buildSchema(member, { resolveChild, mode: 'update' });

describe('buildSchema', () => {
  it('accepts a complete valid document', () => {
    const r = create.safeParse({
      fullName: 'Tan Ah Kow',
      age: 30,
      gender: 'Male',
      dues: 300.5,
      joinDate: '2026-01-15',
      lastSeen: '2026-09-29T10:00:00+08:00',
      active: true,
      avatar: 'https://example.com/a.png',
      extra: { a: 1 },
      homeOrg: 'jci-kl',
      history: [{ year: 2025, note: 'Joined' }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts null for optional fields', () => {
    expect(create.safeParse({ fullName: 'A', age: null, gender: null }).success).toBe(true);
  });

  it('requires reqd fields on create, and trims Data', () => {
    expect(create.safeParse({}).success).toBe(false);
    expect(create.safeParse({ fullName: '   ' }).success).toBe(false);
  });

  it('allows omitting reqd fields on update but not nulling them', () => {
    expect(update.safeParse({ age: 31 }).success).toBe(true);
    expect(update.safeParse({ fullName: null }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(create.safeParse({ fullName: 'A', foo: 1 }).success).toBe(false);
  });

  it('validates each field type', () => {
    const bad: Record<string, unknown>[] = [
      { gender: 'Other' },
      { dues: 300.555 },
      { age: 1.5 },
      { joinDate: '29/09/2026' },
      { lastSeen: 'yesterday' },
      { active: 'yes' },
      { avatar: 'not a url' },
      { homeOrg: '' },
      { history: [{ note: 'missing year' }] },
    ];
    for (const b of bad) expect(create.safeParse({ fullName: 'A', ...b }).success, JSON.stringify(b)).toBe(false);
  });

  it('nests custom fields under custom', () => {
    const s = buildSchema(member, {
      resolveChild,
      customFields: [{ fieldname: 'shirtSize', label: 'Shirt', fieldtype: 'Select', options: ['S', 'M', 'L'], isCustom: true }],
    });
    expect(s.safeParse({ fullName: 'A', custom: { shirtSize: 'M' } }).success).toBe(true);
    expect(s.safeParse({ fullName: 'A', custom: { shirtSize: 'XXL' } }).success).toBe(false);
    expect(s.safeParse({ fullName: 'A', custom: { other: 1 } }).success).toBe(false);
    expect(create.safeParse({ fullName: 'A', custom: {} }).success).toBe(false); // no custom fields defined
  });

  it('throws MetaError for Table fields without resolveChild', () => {
    expect(() => buildSchema(member)).toThrow(MetaError);
  });
});
