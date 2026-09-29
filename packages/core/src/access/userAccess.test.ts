import { describe, expect, it } from 'vitest';
import { buildUserAccess, parseGrant, userContextFromAccess } from './userAccess';

describe('buildUserAccess', () => {
  it('groups grants into per-role scopes, sorted and de-duplicated', () => {
    const access = buildUserAccess('u1', 'p1', [
      { role: 'Member', orgId: 'jci-pj', withDescendants: false },
      { role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true },
      { role: 'Member', orgId: 'jci-kl', withDescendants: false },
      { role: 'Member', orgId: 'jci-kl', withDescendants: false },
      { role: 'Hacker', orgId: 'jci', withDescendants: true },
    ]);
    expect(access).toEqual({
      uid: 'u1',
      personId: 'p1',
      grants: [
        { role: 'Member', orgId: 'jci-kl', withDescendants: false },
        { role: 'Member', orgId: 'jci-pj', withDescendants: false },
        { role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true },
      ],
      scopes: {
        Member: { exact: ['jci-kl', 'jci-pj'], subtree: [] },
        MembershipOfficer: { exact: [], subtree: ['jci-malaysia'] },
      },
    });
  });
});

describe('parseGrant and userContextFromAccess', () => {
  it('accepts only well-formed grants with known roles', () => {
    expect(parseGrant({ role: 'Member', orgId: 'jci-kl' })).toEqual({ role: 'Member', orgId: 'jci-kl', withDescendants: false });
    expect(parseGrant({ role: 'Member', orgId: '' })).toBeNull();
    expect(parseGrant({ role: 'Root', orgId: 'jci' })).toBeNull();
    expect(parseGrant('Member')).toBeNull();
  });

  it('turns a stored doc back into a UserContext', () => {
    expect(userContextFromAccess(null, 'u1')).toEqual({ uid: 'u1', personId: null, grants: [] });
    expect(
      userContextFromAccess(
        { personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }, { role: 'Root', orgId: 'x' }] },
        'u1',
      ),
    ).toEqual({ uid: 'u1', personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] });
  });
});
