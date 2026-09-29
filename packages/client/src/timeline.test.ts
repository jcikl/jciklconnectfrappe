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

  it('tolerates missing data', () => {
    expect(timelineEntries([{ id: 'v', data: {} }], {})).toEqual([{ id: 'v', action: 'update', by: '', at: null, changes: [] }]);
  });
});

describe('label lookup and isCapped', () => {
  it('ignores inherited keys when labelling', () => {
    const e = timelineEntries([{ id: 'v', data: { action: 'create', changed: [{ field: 'constructor', old: 1, new: 2 }] } }], {});
    expect(e[0]!.changes).toEqual([]);
  });

  it('reports when the history hit the limit', () => {
    expect(isCapped(new Array(99))).toBe(false);
    expect(isCapped(new Array(100))).toBe(true);
    expect(isCapped([1, 2], 2)).toBe(true);
    expect(isCapped([1], 2)).toBe(false);
  });
});

describe('timelineEntries and fields the reader cannot see', () => {
  const at = { toDate: () => new Date('2026-09-29T00:00:00Z') };
  it('drops changes to keys without a label', () => {
    const e = timelineEntries(
      [{ id: 'v', data: { action: 'update', at, changed: [{ field: 'title', old: 'a', new: 'b' }, { field: 'custom.secret', old: 'x', new: 'y' }] } }],
      { title: 'Name' },
    );
    expect(e[0]!.changes).toEqual([{ label: 'Name', from: 'a', to: 'b' }]);
  });

  it('drops update entries left with no changes, but keeps create and delete', () => {
    const e = timelineEntries(
      [
        { id: 'u', data: { action: 'update', at, changed: [{ field: 'custom.secret', old: 1, new: 2 }] } },
        { id: 'c', data: { action: 'create', at, changed: [{ field: 'custom.secret', old: null, new: 2 }] } },
        { id: 'd', data: { action: 'delete', at, changed: [] } },
      ],
      {},
    );
    expect(e.map((x) => [x.id, x.changes.length]).sort()).toEqual([['c', 0], ['d', 0]]);
  });
});
