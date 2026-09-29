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

/** Version documents as timeline entries, newest first. `labels` maps field keys to their labels. */
export function timelineEntries(docs: readonly QueryDoc[], labels: Readonly<Record<string, string>>): TimelineEntry[] {
  return docs
    .map((d) => {
      const changed = Array.isArray(d.data.changed) ? d.data.changed : [];
      return {
        id: d.id,
        action: typeof d.data.action === 'string' ? d.data.action : 'update',
        by: typeof d.data.by === 'string' ? d.data.by : '',
        at: toDate(d.data.at),
        changes: changed.filter(isRecord).map((c) => ({
          label: Object.hasOwn(labels, String(c.field)) ? labels[String(c.field)]! : String(c.field),
          from: formatValue(c.old),
          to: formatValue(c.new),
        })),
      };
    })
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
}
