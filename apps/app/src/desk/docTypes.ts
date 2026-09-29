import type { QueryDoc } from '@jci/client';
import type { DocTypeMeta } from '@jci/core';
import { registry } from '@jci/doctypes';

/** A document's display title: its titleField value, or its id. */
export function docTitle(meta: DocTypeMeta, doc: QueryDoc): string {
  const raw = meta.titleField ? doc.data[meta.titleField] : undefined;
  return typeof raw === 'string' && raw !== '' ? raw : doc.id;
}

/** The DocType a /desk route names, if it is a registered, non-child DocType. */
export function deskDocType(name: unknown): DocTypeMeta | null {
  return typeof name === 'string' && registry.has(name) && !registry.get(name).isChild ? registry.get(name) : null;
}
