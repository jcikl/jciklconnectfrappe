import { MetaError } from '../errors';
import { validateField } from './defineDocType';
import type { DocTypeMeta, FieldDef, FieldType } from './types';

export function validateCustomField(meta: DocTypeMeta, field: FieldDef): void {
  validateField(meta.name, field);
  if (field.fieldtype === 'Table') throw new MetaError(`${meta.name}.${field.fieldname}: custom fields cannot be Table`);
  if (meta.fields.some((f) => f.fieldname === field.fieldname)) {
    throw new MetaError(`${meta.name}.${field.fieldname}: custom field collides with a core field`);
  }
}

/** Validates every custom field and rejects duplicate fieldnames within the list. */
export function validateCustomFields(meta: DocTypeMeta, custom: readonly FieldDef[]): void {
  const seen = new Set<string>();
  for (const f of custom) {
    validateCustomField(meta, f);
    if (seen.has(f.fieldname)) throw new MetaError(`${meta.name}.${f.fieldname}: duplicate custom fieldname`);
    seen.add(f.fieldname);
  }
}

export function mergeCustomFields(meta: DocTypeMeta, custom: readonly FieldDef[]): FieldDef[] {
  validateCustomFields(meta, custom);
  return [...meta.fields, ...custom.map((f) => ({ ...f, isCustom: true }))];
}

/** Path of the field's value inside a stored document. */
export function fieldKey(field: FieldDef): string {
  return field.isCustom ? `custom.${field.fieldname}` : field.fieldname;
}

/** Converts a stored CustomField document into a FieldDef. Options are stored one per line. */
export function customFieldFromDoc(doc: Record<string, unknown>): FieldDef {
  const options =
    typeof doc.options === 'string'
      ? doc.options
          .split('\n')
          .map((o) => o.trim())
          .filter((o) => o !== '')
      : [];
  return {
    fieldname: String(doc.fieldname),
    label: String(doc.label),
    fieldtype: doc.fieldtype as FieldType,
    ...(options.length > 0 ? { options } : {}),
    ...(typeof doc.link === 'string' && doc.link !== '' ? { link: doc.link } : {}),
    ...(typeof doc.permlevel === 'number' ? { permlevel: doc.permlevel } : {}),
    ...(doc.reqd === true ? { reqd: true } : {}),
  };
}
