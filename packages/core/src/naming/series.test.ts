import { describe, expect, it } from 'vitest';
import { MetaError } from '../errors';
import { formatSeriesName, parseSeriesPattern, seriesPrefix } from './series';

const d = { year: 2026, month: 9, day: 5 };

describe('naming series', () => {
  it('formats a Frappe-style pattern', () => {
    expect(formatSeriesName('MEM-.YYYY.-.#####', d, 1)).toBe('MEM-2026-00001');
    expect(formatSeriesName('DUE-.YY.MM.-.###', d, 42)).toBe('DUE-2609-042');
    expect(formatSeriesName('X-.DD.-.##', d, 7)).toBe('X-05-07');
  });

  it('does not truncate counters wider than the hash block', () => {
    expect(formatSeriesName('A-.##', d, 1234)).toBe('A-1234');
  });

  it('computes the counter prefix used as the counter key', () => {
    expect(seriesPrefix('MEM-.YYYY.-.#####', d)).toBe('MEM-2026-');
  });

  it('reports hash width and position', () => {
    expect(parseSeriesPattern('MEM-.YYYY.-.#####')).toEqual({
      tokens: ['MEM-', 'YYYY', '-', '#####'],
      hashIndex: 3,
      width: 5,
    });
  });

  it('rejects patterns without exactly one trailing hash block', () => {
    expect(() => parseSeriesPattern('MEM-.YYYY')).toThrow(MetaError);
    expect(() => parseSeriesPattern('A-.##.-.##')).toThrow(MetaError);
    expect(() => parseSeriesPattern('A-.##.-X')).toThrow(MetaError);
  });

  it('rejects non-positive or fractional counters', () => {
    expect(() => formatSeriesName('A-.##', d, 0)).toThrow(RangeError);
    expect(() => formatSeriesName('A-.##', d, 1.5)).toThrow(RangeError);
  });

  it('rejects patterns containing "/" (unsafe in a series/{prefix} doc id)', () => {
    expect(() => parseSeriesPattern('MEM/.YYYY.-.#####')).toThrow(MetaError);
    expect(() => formatSeriesName('A/B-.##', d, 1)).toThrow(MetaError);
  });
});
