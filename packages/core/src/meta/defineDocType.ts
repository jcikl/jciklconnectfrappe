import { MetaError } from '../errors';
import { parseSeriesPattern } from '../naming/series';
import { FIELD_TYPES, SYSTEM_FIELDS, type DocTypeInput, type DocTypeMeta, type FieldDef } from './types';

const DOCTYPE_NAME = /^[A-Z][A-Za-z0-9]*$/;
const FIELDNAME = /^[a-z][A-Za-z0-9]*$/;
const RESERVED = new Set<string>([...SYSTEM_FIELDS, 'custom']);
/** Highest field/permission permlevel accepted (Frappe uses 0-9). */
export const MAX_PERMLEVEL = 9;

export function validateField(doctype: string, f: FieldDef): void {
  const where = `${doctype}.${f.fieldname}`;
  if (!FIELDNAME.test(f.fieldname)) throw new MetaError(`${where}: fieldname must be camelCase`);
  if (RESERVED.has(f.fieldname)) throw new MetaError(`${where}: fieldname is reserved`);
  if (!(FIELD_TYPES as readonly string[]).includes(f.fieldtype)) {
    throw new MetaError(`${where}: unknown fieldtype "${f.fieldtype}"`);
  }
  if (f.fieldtype === 'Select' && (!f.options || f.options.length === 0)) {
    throw new MetaError(`${where}: Select fields need options`);
  }
  if (f.fieldtype === 'Link' && !f.link) throw new MetaError(`${where}: Link fields need a link target`);
  if (f.fieldtype === 'Table' && !f.childDocType) throw new MetaError(`${where}: Table fields need a childDocType`);
  const level = f.permlevel ?? 0;
  if (!Number.isInteger(level) || level < 0 || level > MAX_PERMLEVEL) {
    throw new MetaError(`${where}: permlevel must be an integer 0-${MAX_PERMLEVEL}`);
  }
}

export function defineDocType(input: DocTypeInput): DocTypeMeta {
  if (!DOCTYPE_NAME.test(input.name)) {
    throw new MetaError(`DocType name "${input.name}" must be PascalCase`);
  }
  const isChild = input.isChild ?? false;
  if (!isChild && !input.collection) throw new MetaError(`${input.name}: collection is required`);
  if (isChild && input.permissions && input.permissions.length > 0) {
    throw new MetaError(`${input.name}: child DocTypes inherit permissions from their parent`);
  }

  const seen = new Set<string>();
  for (const f of input.fields) {
    validateField(input.name, f);
    if (seen.has(f.fieldname)) throw new MetaError(`${input.name}.${f.fieldname}: duplicate fieldname`);
    seen.add(f.fieldname);
  }
  const mustExist = (ref: string, what: string): void => {
    if (!seen.has(ref)) throw new MetaError(`${input.name}: ${what} "${ref}" is not a field`);
  };
  if (input.titleField) mustExist(input.titleField, 'titleField');
  for (const s of input.searchFields ?? []) mustExist(s, 'searchField');
  for (const l of input.listFields ?? []) mustExist(l, 'listField');
  for (const f of input.fields) if (f.dependsOn) mustExist(f.dependsOn.field, `dependsOn of ${f.fieldname}`);

  const naming = input.naming ?? { kind: 'autoId' };
  if (naming.kind === 'field') mustExist(naming.field, 'naming field');
  if (naming.kind === 'series') parseSeriesPattern(naming.pattern);

  return Object.freeze({
    name: input.name,
    module: input.module,
    collection: input.collection ?? '',
    naming: Object.freeze({ ...naming }),
    fields: Object.freeze(input.fields.map((f) => Object.freeze({ ...f }))),
    permissions: Object.freeze((input.permissions ?? []).map((p) => Object.freeze({ ...p }))),
    titleField: input.titleField ?? null,
    searchFields: Object.freeze([...(input.searchFields ?? [])]),
    listFields: Object.freeze([...(input.listFields ?? [])]),
    isChild,
    trackChanges: input.trackChanges ?? true,
    orgScoped: input.orgScoped ?? !isChild,
  });
}
