import { deepEqual, fieldKey, getFieldValue, type FieldDef, type Registry } from '@jci/core';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { invalid, type Issue } from './errors';
import { isValidDocId } from './naming';
import { docRef } from './store';

interface LinkValue {
  path: string;
  doctype: string;
  id: unknown;
}

function collectLinks(registry: Registry, fields: readonly FieldDef[], doc: Record<string, unknown> | null): LinkValue[] {
  const out: LinkValue[] = [];
  if (!doc) return out;
  for (const f of fields) {
    if (f.fieldtype === 'Link') {
      const id = getFieldValue(doc, fieldKey(f));
      if (id !== null && id !== '') out.push({ path: fieldKey(f), doctype: f.link!, id });
    } else if (f.fieldtype === 'Table' && Array.isArray(doc[f.fieldname])) {
      const child = registry.get(f.childDocType!);
      (doc[f.fieldname] as unknown[]).forEach((row, i) => {
        if (row === null || typeof row !== 'object') return;
        for (const cf of child.fields) {
          const id = (row as Record<string, unknown>)[cf.fieldname] ?? null;
          if (cf.fieldtype === 'Link' && id !== null && id !== '') {
            out.push({ path: `${f.fieldname}.${i}.${cf.fieldname}`, doctype: cf.link!, id });
          }
        }
      });
    }
  }
  return out;
}

/** Rejects Link values that point at missing documents. Links unchanged since `before` are not re-checked. */
export async function checkLinks(
  tx: Transaction,
  deps: { db: Firestore; registry: Registry },
  fields: readonly FieldDef[],
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<void> {
  const previous = collectLinks(deps.registry, fields, before);
  const issues: Issue[] = [];
  for (const link of collectLinks(deps.registry, fields, after)) {
    if (previous.some((p) => p.path === link.path && deepEqual(p.id, link.id))) continue;
    const exists =
      typeof link.id === 'string' &&
      isValidDocId(link.id) &&
      (await tx.get(docRef(deps.db, deps.registry.get(link.doctype), link.id))).exists;
    if (!exists) issues.push({ path: link.path, message: `${link.doctype} "${String(link.id)}" does not exist` });
  }
  if (issues.length > 0) throw invalid(issues);
}
