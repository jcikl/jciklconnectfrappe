import { describe, expect, it } from 'vitest';
import { MetaError } from '../errors';
import { customFieldFromDoc, fieldKey, mergeCustomFields, validateCustomField } from './customFields';
import { defineDocType } from './defineDocType';

const meta = defineDocType({
  name: 'Person',
  module: 'membership',
  collection: 'persons',
  fields: [{ fieldname: 'fullName', label: 'Full name', fieldtype: 'Data' }],
});

describe('custom fields', () => {
  it('merges custom fields after core fields and marks them', () => {
    const merged = mergeCustomFields(meta, [{ fieldname: 'shirtSize', label: 'Shirt', fieldtype: 'Select', options: ['S', 'M'] }]);
    expect(merged.map(fieldKey)).toEqual(['fullName', 'custom.shirtSize']);
    expect(merged[1]!.isCustom).toBe(true);
  });

  it('rejects Table custom fields, collisions and invalid definitions', () => {
    expect(() => validateCustomField(meta, { fieldname: 'rows', label: 'Rows', fieldtype: 'Table', childDocType: 'X' })).toThrow(/Table/);
    expect(() => validateCustomField(meta, { fieldname: 'fullName', label: 'Dup', fieldtype: 'Data' })).toThrow(/collides/);
    expect(() => validateCustomField(meta, { fieldname: 'Bad Name', label: 'B', fieldtype: 'Data' })).toThrow(MetaError);
  });

  it('rejects duplicate custom fieldnames in one call', () => {
    expect(() =>
      mergeCustomFields(meta, [
        { fieldname: 'z', label: 'Z', fieldtype: 'Data', permlevel: 2 },
        { fieldname: 'z', label: 'Z again', fieldtype: 'Data', permlevel: 0 },
      ]),
    ).toThrow(/duplicate/);
    expect(() =>
      mergeCustomFields(meta, [
        { fieldname: 'z', label: 'Z', fieldtype: 'Data' },
        { fieldname: 'z', label: 'Z again', fieldtype: 'Data' },
      ]),
    ).toThrow(MetaError);
  });
});

describe('customFieldFromDoc', () => {
  it('maps a stored CustomField document to a FieldDef', () => {
    expect(
      customFieldFromDoc({
        id: 'Person.shirtSize',
        targetDocType: 'Person',
        fieldname: 'shirtSize',
        label: 'Shirt size',
        fieldtype: 'Select',
        options: 'S\n M \n\nL',
        permlevel: 1,
        reqd: true,
        org: 'jci-kl',
      }),
    ).toEqual({ fieldname: 'shirtSize', label: 'Shirt size', fieldtype: 'Select', options: ['S', 'M', 'L'], permlevel: 1, reqd: true });
    expect(customFieldFromDoc({ fieldname: 'mentor', label: 'Mentor', fieldtype: 'Link', link: 'Person', options: null })).toEqual({
      fieldname: 'mentor',
      label: 'Mentor',
      fieldtype: 'Link',
      link: 'Person',
    });
  });
});
