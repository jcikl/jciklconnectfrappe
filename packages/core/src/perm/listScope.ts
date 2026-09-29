import type { DocPerm, DocTypeMeta, RoleName } from '../meta/types';
import type { UserContext } from './evaluate';

/** An org the Desk can be scoped to: one of the caller's grant orgs. */
export interface ScopeOption {
  orgId: string;
  /** true when some grant at this org covers its whole subtree. */
  withDescendants: boolean;
}

/** A Firestore filter the client adds to a list query. Only shapes the generated rules can prove safe. */
export type ListFilter =
  | { field: 'orgId' | 'ownerPersonId'; op: '=='; value: string }
  | { field: 'orgPath'; op: 'array-contains'; value: string };

function readRows(meta: DocTypeMeta): DocPerm[] {
  return meta.permissions.filter((p) => (p.permlevel ?? 0) === 0 && p.read === true);
}

export function canReadSomewhere(meta: DocTypeMeta, user: UserContext): boolean {
  const held = new Set(user.grants.map((g) => g.role));
  return readRows(meta).some((p) => held.has(p.role) && (!p.ifOwner || user.personId !== null));
}

export function readableDocTypes(metas: readonly DocTypeMeta[], user: UserContext): DocTypeMeta[] {
  return metas.filter((m) => !m.isChild && canReadSomewhere(m, user));
}

export function scopeOptions(user: UserContext): ScopeOption[] {
  const byOrg = new Map<string, boolean>();
  for (const g of user.grants) byOrg.set(g.orgId, (byOrg.get(g.orgId) ?? false) || g.withDescendants);
  return [...byOrg]
    .map(([orgId, withDescendants]) => ({ orgId, withDescendants }))
    .sort((a, b) => Number(b.withDescendants) - Number(a.withDescendants) || (a.orgId < b.orgId ? -1 : a.orgId > b.orgId ? 1 : 0));
}

/**
 * Filters for listing `meta` inside `scope`. The generated rules allow exactly these shapes:
 * a subtree grant at the scope org gives `orgPath array-contains`, an exact grant gives `orgId ==`,
 * and an ifOwner row adds `ownerPersonId ==`. Returns null when no read row applies there.
 * Global DocTypes ignore the scope.
 */
export function listFilters(meta: DocTypeMeta, user: UserContext, scope: ScopeOption | null): ListFilter[] | null {
  const rows = readRows(meta);
  const plain = new Set<RoleName>(rows.filter((p) => !p.ifOwner).map((p) => p.role));
  const owner = new Set<RoleName>(rows.filter((p) => p.ifOwner).map((p) => p.role));
  const ownerFilter: ListFilter | null = user.personId === null ? null : { field: 'ownerPersonId', op: '==', value: user.personId };

  if (!meta.orgScoped) {
    if (user.grants.some((g) => plain.has(g.role))) return [];
    if (ownerFilter && user.grants.some((g) => owner.has(g.role))) return [ownerFilter];
    return null;
  }
  if (!scope) return null;

  const here = user.grants.filter((g) => g.orgId === scope.orgId);
  const orgFilter = (roles: ReadonlySet<RoleName>): ListFilter | null => {
    if (here.some((g) => roles.has(g.role) && g.withDescendants)) return { field: 'orgPath', op: 'array-contains', value: scope.orgId };
    if (here.some((g) => roles.has(g.role))) return { field: 'orgId', op: '==', value: scope.orgId };
    return null;
  };

  const wide = orgFilter(plain);
  if (wide) return [wide];
  const own = orgFilter(owner);
  return own && ownerFilter ? [own, ownerFilter] : null;
}

/** A readable label for a DocType name: 'RoleAssignment' → 'Role Assignment'. */
export function docTypeLabel(meta: DocTypeMeta): string {
  return meta.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}
