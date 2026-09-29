import { formatSeriesName, SERIES_COLLECTION, seriesPrefix, type DateParts, type DocTypeMeta } from '@jci/core';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { invalid } from './errors';

/** A write to apply at the end of a transaction, after every read. */
export type PendingWrite = (tx: Transaction) => void;

const DOC_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/;

export function isValidDocId(id: string): boolean {
  return DOC_ID.test(id);
}

export function datePartsIn(timeZone: string, date: Date): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
  const part = (type: 'year' | 'month' | 'day') => Number(parts.find((p) => p.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

export interface PlannedId {
  id: string;
  writes: PendingWrite[];
}

/** Chooses the new document's id. Series counters are read now and written only when the caller runs `writes`. */
export async function planId(
  tx: Transaction,
  db: Firestore,
  meta: DocTypeMeta,
  data: Record<string, unknown>,
  date: DateParts,
): Promise<PlannedId> {
  const naming = meta.naming;
  switch (naming.kind) {
    case 'autoId':
      return { id: db.collection(meta.collection).doc().id, writes: [] };
    case 'series': {
      const ref = db.collection(SERIES_COLLECTION).doc(seriesPrefix(naming.pattern, date));
      const snap = await tx.get(ref);
      const current = snap.get('current');
      const next = (typeof current === 'number' ? current : 0) + 1;
      return { id: formatSeriesName(naming.pattern, date, next), writes: [(t) => t.set(ref, { current: next })] };
    }
    case 'field':
    case 'fields': {
      const names = naming.kind === 'field' ? [naming.field] : naming.fields;
      const values = names.map((name) => {
        const value = data[name];
        if (typeof value !== 'string' || value.trim() === '') throw invalid([{ path: name, message: 'Required' }]);
        return value.trim();
      });
      const id = values.join('.');
      if (!isValidDocId(id)) {
        throw invalid([{ path: names.join(','), message: 'Use only letters, digits, ".", "_" and "-"' }]);
      }
      return { id, writes: [] };
    }
  }
}
