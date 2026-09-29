import { deepEqual } from '../diff/diffDocs';
import { fieldKey } from '../meta/customFields';
import type { DocTypeMeta, FieldDef } from '../meta/types';
import { getFieldValue, type DocAccess } from '../perm/access';

/** A field as the Desk form shows it. `key` is where its value lives in form values: 'name' or 'custom.name'. */
export interface FormField {
  def: FieldDef;
  key: string;
  /**
   * The caller may change this field. On update, a Table field is editable only when every child column (hidden
   * ones included) is readable: the client holds redacted rows, and sending them back would null unread columns.
   */
  editable: boolean;
  /**
   * Table fields on update only: rows are append-only: the server compares rows by position, so removing,
   * inserting or reordering existing rows is refused. True when the table is editable and some readable
   * child column is locked (readOnly or above the caller's write levels). Always false on create, for other
   * fields and for child columns.
   */
  rowsFixed: boolean;
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

/**
 * Non-hidden fields in DocType order (custom fields last), with editability from the caller's permissions.
 * On update only readable fields are listed; on create, fields that are readable or editable, so a
 * create-only role still gets a form. Child columns follow the same rule.
 */
export function formFields(access: DocAccess, resolveChild: (name: string) => DocTypeMeta, isNew: boolean): FormField[] {
  const shown = (f: FieldDef) => access.canReadField(f) || (isNew && access.canEditField(f, true));
  return access.fields
    .filter((def) => def.hidden !== true && shown(def))
    .map((def): FormField => {
      if (def.fieldtype !== 'Table') {
        return { def, key: fieldKey(def), editable: access.canEditField(def, isNew), rowsFixed: false, children: null };
      }
      const childFields = resolveChild(def.childDocType!).fields;
      // No rows exist on create, so the client never holds redacted rows then.
      const editable = access.canEditField(def, isNew) && (isNew || childFields.every((cf) => access.canReadField(cf)));
      const rowsFixed = !isNew && editable && childFields.some((cf) => access.canReadField(cf) && !access.canEditField(cf, isNew));
      const children = childFields
        .filter((cf) => cf.hidden !== true && shown(cf))
        .map((cf) => ({ def: cf, key: cf.fieldname, editable: editable && access.canEditField(cf, isNew), rowsFixed: false, children: null }));
      return { def, key: fieldKey(def), editable, rowsFixed, children };
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
 * The body to send: editable fields only. On create (`before` null), every non-empty value (an empty table
 * counts as empty); on update, only values that differ from `before`, compared with optional blanks as null
 * on both sides and a missing or null table as no rows. Optional blanks become null; custom values nest under `custom`; tables are sent as complete rows.
 * Pass the full field list from formFields, not visibleFormFields: changed values of fields currently hidden
 * by dependsOn are still sent.
 */
export function formPayload(fields: readonly FormField[], values: FormValues, before: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  // Optional blanks read as null; a missing table reads as no rows.
  const normalise = (f: FormField, v: unknown): unknown => {
    if (f.def.fieldtype === 'Table') return v ?? [];
    return v === '' && f.def.reqd !== true ? null : v;
  };
  for (const f of fields) {
    if (!f.editable) continue;
    const v = normalise(f, values[f.key] ?? null);
    const unchanged =
      before === null
        ? v === null || (Array.isArray(v) && v.length === 0)
        : deepEqual(v, normalise(f, getFieldValue(before, f.key)));
    if (unchanged) continue;
    if (f.key.startsWith('custom.')) custom[f.def.fieldname] = v;
    else out[f.key] = v;
  }
  if (Object.keys(custom).length > 0) out.custom = custom;
  return out;
}
