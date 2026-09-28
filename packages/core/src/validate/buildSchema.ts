import { z } from 'zod';
import { MetaError } from '../errors';
import type { DocTypeMeta, FieldDef } from '../meta/types';

export interface BuildSchemaOptions {
  customFields?: readonly FieldDef[];
  /** create: reqd fields must be present. update: a patch; reqd fields may be omitted but not nulled. */
  mode?: 'create' | 'update';
  resolveChild?: (name: string) => DocTypeMeta;
}

const hasAtMostTwoDecimals = (v: number): boolean => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

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
      return z.enum(f.options as unknown as [string, ...string[]]);
    case 'Link':
      return z.string().min(1);
    case 'AttachImage':
      return z.url();
    case 'JSON':
      return z.record(z.string(), z.unknown());
    case 'Table': {
      if (!opts.resolveChild) throw new MetaError(`Table field "${f.fieldname}" needs resolveChild`);
      const child = opts.resolveChild(f.childDocType!);
      return z.array(buildSchema(child, { resolveChild: opts.resolveChild, mode: 'create' }));
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
    const customShape: Record<string, z.ZodType> = {};
    for (const f of custom) customShape[f.fieldname] = fieldSchema(f, opts);
    shape.custom = z.strictObject(customShape).optional();
  }
  return z.strictObject(shape);
}
