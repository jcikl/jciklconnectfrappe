import { z } from 'zod';
import { MetaError } from '../errors';
import { validateCustomFields } from '../meta/customFields';
import type { DocTypeMeta, FieldDef } from '../meta/types';

export interface BuildSchemaOptions {
  customFields?: readonly FieldDef[];
  /** create: reqd fields must be present. update: a patch; reqd fields may be omitted but not nulled. */
  mode?: 'create' | 'update';
  resolveChild?: (name: string) => DocTypeMeta;
}

const hasAtMostTwoDecimals = (v: number): boolean => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

const childSchemas = new WeakMap<DocTypeMeta, z.ZodType>();

/** Child rows have no custom fields and are always complete, so one schema per child DocType is enough. */
function childRowSchema(child: DocTypeMeta, resolveChild: (name: string) => DocTypeMeta): z.ZodType {
  let s = childSchemas.get(child);
  if (!s) {
    s = buildSchema(child, { resolveChild, mode: 'create' });
    childSchemas.set(child, s);
  }
  return s;
}

function baseSchema(f: FieldDef, opts: BuildSchemaOptions): z.ZodType {
  switch (f.fieldtype) {
    case 'Data': {
      const s = z.string().trim().max(140);
      return f.reqd ? s.min(1, 'Required') : s;
    }
    case 'Text': {
      const s = z.string().max(20000);
      return f.reqd ? s.min(1, 'Required') : s;
    }
    case 'Int':
      return z.number().int();
    case 'Float':
      return z.number().finite();
    case 'Currency':
      return z.number().finite().refine(hasAtMostTwoDecimals, 'At most 2 decimal places');
    case 'Date':
      return z.iso.date();
    case 'Datetime':
      return z.iso.datetime({ offset: true });
    case 'Check':
      return z.boolean();
    case 'Select':
      return z.literal(f.options!);
    case 'Link':
      return z.string().min(1);
    case 'AttachImage':
      return z.url();
    case 'JSON':
      return z.record(z.string(), z.unknown());
    case 'Table': {
      if (!opts.resolveChild) throw new MetaError(`Table field "${f.fieldname}" needs resolveChild`);
      return z.array(childRowSchema(opts.resolveChild(f.childDocType!), opts.resolveChild));
    }
  }
}

function fieldSchema(f: FieldDef, opts: BuildSchemaOptions): z.ZodType {
  const s = baseSchema(f, opts);
  if (!f.reqd) return s.nullable().optional();
  return opts.mode === 'update' ? s.optional() : s;
}

export function buildSchema(meta: DocTypeMeta, opts: BuildSchemaOptions = {}) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of meta.fields) shape[f.fieldname] = fieldSchema(f, opts);
  const custom = opts.customFields ?? [];
  if (custom.length > 0) {
    validateCustomFields(meta, custom);
    const customShape: Record<string, z.ZodType> = {};
    for (const f of custom) customShape[f.fieldname] = fieldSchema(f, opts);
    const customSchema = z.strictObject(customShape);
    const customRequired = opts.mode !== 'update' && custom.some((f) => f.reqd === true);
    shape.custom = customRequired ? customSchema : customSchema.optional();
  }
  return z.strictObject(shape);
}
