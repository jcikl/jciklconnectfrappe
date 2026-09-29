import type { QueryDoc } from './stores';

export interface TimelineChange {
  label: string;
  from: string;
  to: string;
}

export interface TimelineEntry {
  id: string;
  action: string;
  by: string;
  at: Date | null;
  changes: TimelineChange[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Firestore Timestamps (anything with toDate), Dates and ISO strings. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (isRecord(value) && typeof value.toDate === 'function') return (value as { toDate(): Date }).toDate();
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'row' : 'rows'}`;
  return JSON.stringify(value);
}

/**
 * Version documents as timeline entries, newest first. `labels` maps the keys of fields the reader may see to
 * their labels; changes to any other key are dropped, so history never reveals fields the reader cannot read.
 * An update whose changes were all dropped is left out; create and delete entries stay.
 */
export function timelineEntries(docs: readonly QueryDoc[], labels: Readonly<Record<string, string>>): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const d of docs) {
    const changed = Array.isArray(d.data.changed) ? d.data.changed.filter(isRecord) : [];
    const action = typeof d.data.action === 'string' ? d.data.action : 'update';
    const changes = changed
      .filter((c) => Object.hasOwn(labels, String(c.field)))
      .map((c) => ({ label: labels[String(c.field)]!, from: formatValue(c.old), to: formatValue(c.new) }));
    if (action === 'update' && changed.length > 0 && changes.length === 0) continue;
    entries.push({ id: d.id, action, by: typeof d.data.by === 'string' ? d.data.by : '', at: toDate(d.data.at), changes });
  }
  return entries.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
}
