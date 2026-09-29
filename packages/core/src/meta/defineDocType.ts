import { MetaError } from '../errors';
import { parseSeriesPattern } from '../naming/series';
import { FIELD_TYPES, ROLES, SYSTEM_FIELDS, type DocPerm, type DocTypeInput, type DocTypeMeta, type FieldDef, type Naming } from './types';

const DOCTYPE_NAME = /^[A-Z][A-Za-z0-9]*$/;
const FIELDNAME = /^[a-z][A-Za-z0-9]*$/;
const COLLECTION = /^[a-z][A-Za-z0-9]*$/;
const RESERVED = new Set<string>([...SYSTEM_FIELDS, 'custom']);
/** Field types whose value can become part of a document id. */
const NAMING_FIELD_TYPES = new Set<string>(['Data', 'Select']);
/** Highest field/permission permlevel accepted (Frappe uses 0-9). */
export const MAX_PERMLEVEL = 9;

function validPermlevel(level: number): boolean {
  return Number.isInteger(level) && level >= 0 && level <= MAX_PERMLEVEL;
}

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
  if (!validPermlevel(f.permlevel ?? 0)) {
    throw new MetaError(`${where}: permlevel must be an integer 0-${MAX_PERMLEVEL}`);
  }
}

export function validateDocPerm(doctype: string, p: DocPerm): void {
  const where = `${doctype} permission for "${String(p.role)}"`;
  if (!(ROLES as readonly string[]).includes(p.role)) throw new MetaError(`${where}: unknown role`);
  const level = p.permlevel ?? 0;
  if (!validPermlevel(level)) throw new MetaError(`${where}: permlevel must be an integer 0-${MAX_PERMLEVEL}`);
  if (level > 0 && (p.create === true || p.delete === true)) {
    throw new MetaError(`${where}: create and delete only apply at permlevel 0`);
  }
}

function validateNaming(input: DocTypeInput, naming: Naming): void {
  if (naming.kind === 'autoId') return;
  if (naming.kind === 'series') {
    parseSeriesPattern(naming.pattern);
    return;
  }
  const names = naming.kind === 'field' ? [naming.field] : naming.fields;
  if (names.length === 0) throw new MetaError(`${input.name}: naming needs at least one field`);
  for (const name of names) {
    const f = input.fields.find((x) => x.fieldname === name);
    if (!f) throw new MetaError(`${input.name}: naming field "${name}" is not a field`);
    if (f.reqd !== true || !NAMING_FIELD_TYPES.has(f.fieldtype)) {
      throw new MetaError(`${input.name}: naming field "${name}" must be a reqd Data or Select field`);
    }
  }
}

function freezeField(f: FieldDef): FieldDef {
  return Object.freeze({
    ...f,
    ...(f.options ? { options: Object.freeze([...f.options]) } : {}),
    ...(f.dependsOn ? { dependsOn: Object.freeze({ ...f.dependsOn }) } : {}),
  });
}

function freezeNaming(naming: Naming): Naming {
  return Object.freeze(naming.kind === 'fields' ? { ...naming, fields: Object.freeze([...naming.fields]) } : { ...naming });
}

export function defineDocType(input: DocTypeInput): DocTypeMeta {
  if (!DOCTYPE_NAME.test(input.name)) {
    throw new MetaError(`DocType name "${input.name}" must be PascalCase`);
  }
  const isChild = input.isChild ?? false;
  if (!isChild && !input.collection) throw new MetaError(`${input.name}: collection is required`);
  if (input.collection && !COLLECTION.test(input.collection)) {
    throw new MetaError(`${input.name}: collection "${input.collection}" must be camelCase letters and digits`);
  }
  if (isChild && input.permissions && input.permissions.length > 0) {
    throw new MetaError(`${input.name}: child DocTypes inherit permissions from their parent`);
  }
  for (const p of input.permissions ?? []) validateDocPerm(input.name, p);

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
  validateNaming(input, naming);

  return Object.freeze({
    name: input.name,
    module: input.module,
    collection: input.collection ?? '',
    naming: freezeNaming(naming),
    fields: Object.freeze(input.fields.map(freezeField)),
    permissions: Object.freeze((input.permissions ?? []).map((p) => Object.freeze({ ...p }))),
    titleField: input.titleField ?? null,
    searchFields: Object.freeze([...(input.searchFields ?? [])]),
    listFields: Object.freeze([...(input.listFields ?? [])]),
    isChild,
    trackChanges: input.trackChanges ?? true,
    orgScoped: input.orgScoped ?? !isChild,
  });
}
