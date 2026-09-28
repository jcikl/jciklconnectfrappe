import { describe, expect, it } from 'vitest';
import { MetaError } from '../errors';
import { defineDocType } from './defineDocType';
import { createRegistry } from './registry';
import type { DocTypeInput } from './types';

const personInput = (): DocTypeInput => ({
  name: 'Person',
  module: 'membership',
  collection: 'persons',
  naming: { kind: 'series', pattern: 'PER-.YYYY.-.#####' },
  titleField: 'fullName',
  listFields: ['fullName', 'email'],
  searchFields: ['fullName'],
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data', reqd: true },
    { fieldname: 'email', label: 'Email', fieldtype: 'Data' },
    { fieldname: 'gender', label: 'Gender', fieldtype: 'Select', options: ['Male', 'Female'] },
  ],
  permissions: [{ role: 'Member', read: true }],
});

describe('defineDocType', () => {
  it('applies defaults and freezes the result', () => {
    const m = defineDocType(personInput());
    expect(m.trackChanges).toBe(true);
    expect(m.isChild).toBe(false);
    expect(m.orgScoped).toBe(true);
    expect(m.titleField).toBe('fullName');
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.fields)).toBe(true);
  });

  it('defaults naming to autoId', () => {
    const { naming: _n, ...rest } = personInput();
    void _n;
    expect(defineDocType(rest).naming).toEqual({ kind: 'autoId' });
  });

  it('rejects non-PascalCase names', () => {
    expect(() => defineDocType({ ...personInput(), name: 'person' })).toThrow(MetaError);
  });

  it('rejects bad, duplicate and reserved fieldnames', () => {
    const base = personInput();
    const f = base.fields[0]!;
    expect(() => defineDocType({ ...base, fields: [{ ...f, fieldname: 'Full_Name' }] })).toThrow(/camelCase/);
    expect(() => defineDocType({ ...base, fields: [f, f] })).toThrow(/duplicate/);
    expect(() => defineDocType({ ...base, titleField: undefined, listFields: [], searchFields: [], fields: [{ ...f, fieldname: 'orgId' }] })).toThrow(/reserved/);
    expect(() => defineDocType({ ...base, titleField: undefined, listFields: [], searchFields: [], fields: [{ ...f, fieldname: 'custom' }] })).toThrow(/reserved/);
  });

  it('requires type-specific properties', () => {
    const base = { ...personInput(), titleField: undefined, listFields: [], searchFields: [] };
    expect(() => defineDocType({ ...base, fields: [{ fieldname: 'g', label: 'G', fieldtype: 'Select' }] })).toThrow(/options/);
    expect(() => defineDocType({ ...base, fields: [{ fieldname: 'o', label: 'O', fieldtype: 'Link' }] })).toThrow(/link/);
    expect(() => defineDocType({ ...base, fields: [{ fieldname: 't', label: 'T', fieldtype: 'Table' }] })).toThrow(/childDocType/);
  });

  it('rejects invalid permlevels', () => {
    const base = personInput();
    expect(() => defineDocType({ ...base, fields: [...base.fields, { fieldname: 'x', label: 'X', fieldtype: 'Data', permlevel: 10 }] })).toThrow(/permlevel/);
  });

  it('rejects references to unknown fields', () => {
    expect(() => defineDocType({ ...personInput(), titleField: 'nope' })).toThrow(/titleField/);
    expect(() => defineDocType({ ...personInput(), listFields: ['nope'] })).toThrow(/listField/);
    expect(() => defineDocType({ ...personInput(), searchFields: ['nope'] })).toThrow(/searchField/);
    expect(() => defineDocType({ ...personInput(), naming: { kind: 'field', field: 'nope' } })).toThrow(/naming/);
    const base = personInput();
    expect(() => defineDocType({ ...base, fields: [...base.fields, { fieldname: 'x', label: 'X', fieldtype: 'Data', dependsOn: { field: 'nope' } }] })).toThrow(/dependsOn/);
  });

  it('validates series patterns', () => {
    expect(() => defineDocType({ ...personInput(), naming: { kind: 'series', pattern: 'PER-.YYYY' } })).toThrow(MetaError);
  });

  it('requires a collection unless child, and forbids permissions on child DocTypes', () => {
    const { collection: _c, ...noCollection } = personInput();
    void _c;
    expect(() => defineDocType(noCollection)).toThrow(/collection/);
    expect(() =>
      defineDocType({ name: 'Row', module: 'm', isChild: true, fields: [], permissions: [{ role: 'Member', read: true }] }),
    ).toThrow(/child/);
    const row = defineDocType({ name: 'Row', module: 'm', isChild: true, fields: [] });
    expect(row.collection).toBe('');
    expect(row.orgScoped).toBe(false);
  });
});

describe('createRegistry', () => {
  const org = defineDocType({ name: 'Organization', module: 'core', collection: 'organizations', fields: [{ fieldname: 'orgName', label: 'Name', fieldtype: 'Data' }] });
  const row = defineDocType({ name: 'HistoryRow', module: 'm', isChild: true, fields: [{ fieldname: 'year', label: 'Year', fieldtype: 'Int' }] });
  const person = defineDocType({
    name: 'Person',
    module: 'membership',
    collection: 'persons',
    fields: [
      { fieldname: 'homeOrg', label: 'Org', fieldtype: 'Link', link: 'Organization' },
      { fieldname: 'history', label: 'History', fieldtype: 'Table', childDocType: 'HistoryRow' },
    ],
  });

  it('looks DocTypes up by name', () => {
    const r = createRegistry([org, row, person]);
    expect(r.get('Person')).toBe(person);
    expect(r.has('Nope')).toBe(false);
    expect(r.all()).toHaveLength(3);
    expect(() => r.get('Nope')).toThrow(MetaError);
  });

  it('rejects duplicates, unknown links and non-child tables', () => {
    expect(() => createRegistry([org, org])).toThrow(/Duplicate/);
    expect(() => createRegistry([row, person])).toThrow(/unknown DocType "Organization"/);
    const badTable = defineDocType({ name: 'Bad', module: 'm', collection: 'bad', fields: [{ fieldname: 't', label: 'T', fieldtype: 'Table', childDocType: 'Organization' }] });
    expect(() => createRegistry([org, badTable])).toThrow(/not a child DocType/);
  });
});
