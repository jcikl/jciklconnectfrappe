import { describe, expect, it } from 'vitest';
import { isCapped } from './stores';
import { formatValue, timelineEntries } from './timeline';

describe('formatValue', () => {
  it('renders values for people', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue('')).toBe('—');
    expect(formatValue(true)).toBe('Yes');
    expect(formatValue(false)).toBe('No');
    expect(formatValue(12.5)).toBe('12.5');
    expect(formatValue('JCI KL')).toBe('JCI KL');
    expect(formatValue([{}, {}])).toBe('2 rows');
    expect(formatValue([{}])).toBe('1 row');
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe('timelineEntries', () => {
  it('labels changes, reads Timestamp-like dates and sorts newest first', () => {
    const older = { toDate: () => new Date('2026-09-01T00:00:00Z') };
    const newer = { toDate: () => new Date('2026-09-29T00:00:00Z') };
    const entries = timelineEntries(
      [
        { id: 'v1', data: { action: 'create', by: 'u1', at: older, changed: [{ field: 'title', old: null, new: 'JCI KL' }] } },
        { id: 'v2', data: { action: 'update', by: 'u2', at: newer, changed: [{ field: 'custom.motto', old: 'Old', new: 'New' }, 'junk'] } },
      ],
      { title: 'Name', 'custom.motto': 'Motto' },
    );
    expect(entries).toEqual([
      { id: 'v2', action: 'update', by: 'u2', at: new Date('2026-09-29T00:00:00Z'), changes: [{ label: 'Motto', from: 'Old', to: 'New' }] },
      { id: 'v1', action: 'create', by: 'u1', at: new Date('2026-09-01T00:00:00Z'), changes: [{ label: 'Name', from: '—', to: 'JCI KL' }] },
    ]);
  });

  it('falls back to the raw field name and tolerates missing data', () => {
    expect(timelineEntries([{ id: 'v', data: {} }], {})).toEqual([{ id: 'v', action: 'update', by: '', at: null, changes: [] }]);
  });
});

describe('label lookup and isCapped', () => {
  it('ignores inherited keys when labelling', () => {
    const e = timelineEntries([{ id: 'v', data: { changed: [{ field: 'constructor', old: 1, new: 2 }] } }], {});
    expect(e[0]!.changes[0]!.label).toBe('constructor');
  });

  it('reports when the history hit the limit', () => {
    expect(isCapped(new Array(99))).toBe(false);
    expect(isCapped(new Array(100))).toBe(true);
    expect(isCapped([1, 2], 2)).toBe(true);
    expect(isCapped([1], 2)).toBe(false);
  });
});
