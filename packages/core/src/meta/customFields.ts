import { MetaError } from '../errors';
import { validateField } from './defineDocType';
import type { DocTypeMeta, FieldDef } from './types';

export function validateCustomField(meta: DocTypeMeta, field: FieldDef): void {
  validateField(meta.name, field);
  if (field.fieldtype === 'Table') throw new MetaError(`${meta.name}.${field.fieldname}: custom fields cannot be Table`);
  if (meta.fields.some((f) => f.fieldname === field.fieldname)) {
    throw new MetaError(`${meta.name}.${field.fieldname}: custom field collides with a core field`);
  }
}

export function mergeCustomFields(meta: DocTypeMeta, custom: readonly FieldDef[]): FieldDef[] {
  for (const f of custom) validateCustomField(meta, f);
  return [...meta.fields, ...custom.map((f) => ({ ...f, isCustom: true }))];
}

/** Path of the field's value inside a stored document. */
export function fieldKey(field: FieldDef): string {
  return field.isCustom ? `custom.${field.fieldname}` : field.fieldname;
}
