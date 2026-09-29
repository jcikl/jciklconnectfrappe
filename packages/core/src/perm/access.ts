import type { z } from 'zod';
import { deepEqual } from '../diff/diffDocs';
import { fieldKey, mergeCustomFields } from '../meta/customFields';
import { SYSTEM_FIELDS, type DocTypeMeta, type FieldDef } from '../meta/types';
import { buildSchema } from '../validate/buildSchema';
import { can, patchKeys, permittedLevels, readableFields, type DocContext, type UserContext } from './evaluate';

export interface DocAccessInput {
  meta: DocTypeMeta;
  /** Custom field definitions that apply to this document (not yet marked isCustom). */
  customFields: readonly FieldDef[];
  user: UserContext;
  doc: DocContext;
  resolveChild: (name: string) => DocTypeMeta;
}

export interface DocAccess {
  /** Core fields followed by custom fields (isCustom: true). */
  fields: readonly FieldDef[];
  canRead: boolean;
  canWrite: boolean;
  canCreate: boolean;
  canDelete: boolean;
  readableFields: readonly FieldDef[];
  /** The caller may read this field (core, custom or child column): its permlevel is among their read levels. */
  canReadField(field: FieldDef): boolean;
  /** The caller may set this field: not readOnly, and its permlevel is among their write levels (plus level 0 on create). */
  canEditField(field: FieldDef, isNew: boolean): boolean;
  schema(mode: 'create' | 'update'): z.ZodType;
  /**
   * Keys of `patch` the caller may not change: readOnly fields and fields above their write permlevels,
   * reported only when the value differs from `before`. Child-table fields are reported as 'table.field'.
   * `before` is the stored document, or null on create.
   */
  unwritableKeys(patch: Record<string, unknown>, before: Record<string, unknown> | null): string[];
  /**
   * `redactDoc(doc, readableFields)`, except that each readable Table field's rows keep only the child
   * fields whose permlevel the caller may read. Use this rather than `redactDoc` for anything sent to a client.
   */
  redact(doc: Record<string, unknown>): Record<string, unknown>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Value at a field key ('name' or 'custom.name'); missing values read as null. */
export function getFieldValue(doc: Record<string, unknown> | null, key: string): unknown {
  if (!doc) return null;
  if (key.startsWith('custom.')) {
    const custom = doc.custom;
    return isRecord(custom) ? (custom[key.slice('custom.'.length)] ?? null) : null;
  }
  return doc[key] ?? null;
}

function isLocked(f: FieldDef, levels: ReadonlySet<number>): boolean {
  return f.readOnly === true || !levels.has(f.permlevel ?? 0);
}

/** Rows are compared by position, so clients must send complete rows in their stored order. */
function lockedChildKeys(
  meta: DocTypeMeta,
  resolveChild: (name: string) => DocTypeMeta,
  levels: ReadonlySet<number>,
  patch: Record<string, unknown>,
  before: Record<string, unknown> | null,
): string[] {
  const out: string[] = [];
  for (const f of meta.fields) {
    const rows = patch[f.fieldname];
    if (f.fieldtype !== 'Table' || !Array.isArray(rows)) continue;
    const beforeValue = before?.[f.fieldname];
    const beforeRows: unknown[] = Array.isArray(beforeValue) ? beforeValue : [];
    const count = Math.max(rows.length, beforeRows.length);
    for (const cf of resolveChild(f.childDocType!).fields) {
      if (!isLocked(cf, levels)) continue;
      // Indexes past either end read as null, so a removed row holding a locked value counts as a change.
      const changed = Array.from({ length: count }).some((_, i) => {
        const row: unknown = rows[i];
        const old: unknown = beforeRows[i];
        const next = isRecord(row) ? (row[cf.fieldname] ?? null) : null;
        const prev = isRecord(old) ? (old[cf.fieldname] ?? null) : null;
        return !deepEqual(next, prev);
      });
      if (changed) out.push(`${f.fieldname}.${cf.fieldname}`);
    }
  }
  return out;
}

export function resolveDocAccess(input: DocAccessInput): DocAccess {
  const { meta, user, resolveChild } = input;
  // An org-scoped doc without an org path must never be treated as global: deny everyone.
  const doc: DocContext = meta.orgScoped && input.doc.orgPath === null ? { ...input.doc, orgPath: [] } : input.doc;
  const fields = mergeCustomFields(meta, input.customFields);
  const byKey = new Map(fields.map((f) => [fieldKey(f), f]));
  const canCreate = can(meta, user, 'create', doc);
  const writeLevels = permittedLevels(meta, user, 'write', doc);
  const readLevels = permittedLevels(meta, user, 'read', doc);
  const levelsFor = (isNew: boolean) => (isNew && canCreate ? new Set([0, ...writeLevels]) : writeLevels);
  const readable = readableFields(meta, fields, user, doc);
  const schemas = new Map<'create' | 'update', z.ZodType>();

  return {
    fields,
    canRead: can(meta, user, 'read', doc),
    canWrite: can(meta, user, 'write', doc),
    canCreate,
    canDelete: can(meta, user, 'delete', doc),
    readableFields: readable,
    canReadField: (field) => readLevels.has(field.permlevel ?? 0),
    canEditField: (field, isNew) => !isLocked(field, levelsFor(isNew)),
    schema(mode) {
      let s = schemas.get(mode);
      if (!s) {
        s = buildSchema(meta, { customFields: input.customFields, mode, resolveChild });
        schemas.set(mode, s);
      }
      return s;
    },
    unwritableKeys(patch, before) {
      // A creator may always fill level-0 fields, even with create-only permission.
      const levels = levelsFor(before === null);
      const locked = patchKeys(patch).filter((key) => {
        const f = byKey.get(key);
        return f !== undefined && isLocked(f, levels) && !deepEqual(getFieldValue(patch, key), getFieldValue(before, key));
      });
      return [...locked, ...lockedChildKeys(meta, resolveChild, levels, patch, before)];
    },
    redact(target) {
      const out = redactDoc(target, readable);
      for (const f of readable) {
        const rows = out[f.fieldname];
        if (f.fieldtype !== 'Table' || f.isCustom || !Array.isArray(rows)) continue;
        const visible = resolveChild(f.childDocType!).fields.filter((cf) => readLevels.has(cf.permlevel ?? 0));
        out[f.fieldname] = rows.map((row: unknown) => {
          if (!isRecord(row)) return row;
          const kept: Record<string, unknown> = {};
          for (const cf of visible) if (cf.fieldname in row) kept[cf.fieldname] = row[cf.fieldname];
          return kept;
        });
      }
      return out;
    },
  };
}

/** System fields plus the readable fields of `doc`; custom values stay under `custom`. */
export function redactDoc(doc: Record<string, unknown>, readable: readonly FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SYSTEM_FIELDS) if (k in doc) out[k] = doc[k];
  const custom: Record<string, unknown> = {};
  for (const f of readable) {
    if (f.isCustom) {
      const v = getFieldValue(doc, fieldKey(f));
      if (v !== null) custom[f.fieldname] = v;
    } else if (f.fieldname in doc) {
      out[f.fieldname] = doc[f.fieldname];
    }
  }
  if (Object.keys(custom).length > 0) out.custom = custom;
  return out;
}
