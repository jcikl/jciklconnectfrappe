import { ROLES, type RoleName } from '../meta/types';
import type { RoleGrant, UserContext } from '../perm/evaluate';

export interface RoleScope {
  /** Orgs where the role applies to that org only. */
  exact: string[];
  /** Orgs whose whole subtree the role covers. */
  subtree: string[];
}

/**
 * Stored at userAccess/{uid}; written only by the server.
 * The API reads `grants`; Firestore rules read `scopes` (orgId in exact || orgPath hasAny subtree).
 */
export interface UserAccessDoc {
  uid: string;
  personId: string | null;
  grants: RoleGrant[];
  scopes: Partial<Record<RoleName, RoleScope>>;
}

/** A RoleGrant when the value is a well-formed grant with a known role, else null. */
export function parseGrant(value: unknown): RoleGrant | null {
  if (value === null || typeof value !== 'object') return null;
  const { role, orgId, withDescendants } = value as Record<string, unknown>;
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) return null;
  if (typeof orgId !== 'string' || orgId === '') return null;
  return { role: role as RoleName, orgId, withDescendants: withDescendants === true };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const compareGrants = (a: RoleGrant, b: RoleGrant): number =>
  cmp(a.role, b.role) || cmp(a.orgId, b.orgId) || Number(a.withDescendants) - Number(b.withDescendants);

export function buildUserAccess(uid: string, personId: string | null, grants: readonly unknown[]): UserAccessDoc {
  const unique = new Map<string, RoleGrant>();
  for (const value of grants) {
    const g = parseGrant(value);
    if (g) unique.set(`${g.role}|${g.orgId}|${g.withDescendants}`, g);
  }
  const sorted = [...unique.values()].sort(compareGrants);
  const scopes: Partial<Record<RoleName, RoleScope>> = {};
  for (const g of sorted) {
    const scope = (scopes[g.role] ??= { exact: [], subtree: [] });
    (g.withDescendants ? scope.subtree : scope.exact).push(g.orgId);
  }
  return { uid, personId, grants: sorted, scopes };
}

export function userContextFromAccess(data: unknown, uid: string): UserContext {
  if (data === null || typeof data !== 'object') return { uid, personId: null, grants: [] };
  const { personId, grants } = data as Record<string, unknown>;
  return {
    uid,
    personId: typeof personId === 'string' ? personId : null,
    grants: Array.isArray(grants) ? grants.map(parseGrant).filter((g): g is RoleGrant => g !== null) : [],
  };
}
