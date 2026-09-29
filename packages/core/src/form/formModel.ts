import { deepEqual } from '../diff/diffDocs';
import { fieldKey } from '../meta/customFields';
import type { DocTypeMeta, FieldDef } from '../meta/types';
import { getFieldValue, type DocAccess } from '../perm/access';

/** A field as the Desk form shows it. `key` is where its value lives in form values: 'name' or 'custom.name'. */
export interface FormField {
  def: FieldDef;
  key: string;
  editable: boolean;
  /** Child-table columns the caller may read (Table fields only); null for other field types. */
  children: FormField[] | null;
}

export interface FormSection {
  title: string | null;
  fields: FormField[];
}

/** Form state, keyed by FormField.key. Table values are arrays of row objects keyed by child fieldname. */
export type FormValues = Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Readable, non-hidden fields in DocType order (custom fields last), with editability from the caller's permissions. */
export function formFields(access: DocAccess, resolveChild: (name: string) => DocTypeMeta, isNew: boolean): FormField[] {
  return access.readableFields
    .filter((def) => def.hidden !== true)
    .map((def) => {
      const editable = access.canEditField(def, isNew);
      const children =
        def.fieldtype === 'Table'
          ? resolveChild(def.childDocType!)
              .fields.filter((cf) => cf.hidden !== true && access.canReadField(cf))
              .map((cf) => ({ def: cf, key: cf.fieldname, editable: editable && access.canEditField(cf, isNew), children: null }))
          : null;
      return { def, key: fieldKey(def), editable, children };
    });
}

/** Drops fields whose dependsOn condition is not met by the current values. */
export function visibleFormFields(fields: readonly FormField[], values: FormValues): FormField[] {
  return fields.filter((f) => {
    const dep = f.def.dependsOn;
    if (!dep) return true;
    const v = values[dep.field] ?? null;
    if (dep.equals !== undefined) return deepEqual(v, dep.equals);
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });
}

/** Groups fields by `section`, in the order each section first appears. Fields without one share a null section. */
export function sectionsOf(fields: readonly FormField[]): FormSection[] {
  const sections: FormSection[] = [];
  for (const f of fields) {
    const title = f.def.section ?? null;
    let section = sections.find((s) => s.title === title);
    if (!section) {
      section = { title, fields: [] };
      sections.push(section);
    }
    section.fields.push(f);
  }
  return sections;
}

/** Form values for a stored document (or a new one): missing values are null, tables are copied row by row. */
export function formValues(fields: readonly FormField[], doc: Record<string, unknown> | null): FormValues {
  const values: FormValues = {};
  for (const f of fields) {
    const v = getFieldValue(doc, f.key);
    values[f.key] = f.def.fieldtype === 'Table' ? (Array.isArray(v) ? v.map((row) => (isRecord(row) ? { ...row } : {})) : []) : v;
  }
  return values;
}

/**
 * The body to send: editable fields only. On create (`before` null), every non-empty value; on update, only
 * values that differ from `before`. Optional blanks become null; custom values nest under `custom`;
 * tables are sent as complete rows.
 */
export function formPayload(fields: readonly FormField[], values: FormValues, before: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.editable) continue;
    let v = values[f.key] ?? null;
    if (v === '' && f.def.reqd !== true) v = null;
    const unchanged = before === null ? v === null : deepEqual(v, getFieldValue(before, f.key));
    if (unchanged) continue;
    if (f.key.startsWith('custom.')) custom[f.def.fieldname] = v;
    else out[f.key] = v;
  }
  if (Object.keys(custom).length > 0) out.custom = custom;
  return out;
}
