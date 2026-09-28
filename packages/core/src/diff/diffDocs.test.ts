import { describe, expect, it } from 'vitest';
import { deepEqual, diffDocs } from './diffDocs';

describe('deepEqual', () => {
  it('compares primitives, arrays, objects and dates structurally', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual(new Date(5), new Date(5))).toBe(true);
    expect(deepEqual(null, {})).toBe(false);
  });
});

describe('diffDocs', () => {
  it('lists changed fields sorted, ignoring system fields', () => {
    const before = { id: 'x', updatedAt: 1, fullName: 'A', phone: '1', tags: ['a'] };
    const after = { id: 'x', updatedAt: 2, fullName: 'B', phone: '1', tags: ['a', 'b'] };
    expect(diffDocs(before, after)).toEqual([
      ['fullName', 'A', 'B'],
      ['tags', ['a'], ['a', 'b']],
    ]);
  });

  it('treats a new document as all fields changed from null', () => {
    expect(diffDocs(null, { fullName: 'A', orgId: 'jci-kl' })).toEqual([['fullName', null, 'A']]);
  });

  it('treats undefined and null as equal and reports removals', () => {
    expect(diffDocs({ phone: null }, { phone: undefined })).toEqual([]);
    expect(diffDocs({ phone: '1' }, {})).toEqual([['phone', '1', null]]);
  });

  it('flattens custom fields', () => {
    expect(diffDocs({ custom: { shirt: 'M' } }, { custom: { shirt: 'L', size: 1 } })).toEqual([
      ['custom.shirt', 'M', 'L'],
      ['custom.size', null, 1],
    ]);
  });
});
