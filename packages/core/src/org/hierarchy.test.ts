import { describe, expect, it } from 'vitest';
import { buildOrgPath, canBeChildOf, isWithin, ownOrgId } from './hierarchy';

const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];

describe('org hierarchy', () => {
  it('enforces allowed parent levels', () => {
    expect(canBeChildOf('hq', null)).toBe(true);
    expect(canBeChildOf('area', 'hq')).toBe(true);
    expect(canBeChildOf('national', 'area')).toBe(true);
    expect(canBeChildOf('national_area', 'national')).toBe(true);
    expect(canBeChildOf('local', 'national_area')).toBe(true);
    expect(canBeChildOf('local', 'national')).toBe(true); // countries without areas
    expect(canBeChildOf('local', 'area')).toBe(false);
    expect(canBeChildOf('national', null)).toBe(false);
    expect(canBeChildOf('hq', 'hq')).toBe(false);
  });

  it('builds orgPath including the org itself', () => {
    expect(buildOrgPath(null, 'jci')).toEqual(['jci']);
    expect(buildOrgPath(KL.slice(0, 4), 'jci-kl')).toEqual(KL);
  });

  it('rejects cycles and empty ids', () => {
    expect(() => buildOrgPath(['jci', 'x'], 'jci')).toThrow(/cycle/);
    expect(() => buildOrgPath(['jci'], '')).toThrow(/empty/);
  });

  it('answers subtree membership and own org', () => {
    expect(isWithin(KL, 'jci-malaysia')).toBe(true);
    expect(isWithin(KL, 'jci-singapore')).toBe(false);
    expect(ownOrgId(KL)).toBe('jci-kl');
    expect(() => ownOrgId([])).toThrow(/empty/);
  });
});
