import { describe, expect, it } from 'vitest';
import { MetaError } from '../errors';
import { fieldKey, mergeCustomFields, validateCustomField } from './customFields';
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
});
