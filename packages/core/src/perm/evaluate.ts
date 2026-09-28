import { fieldKey } from '../meta/customFields';
import type { DocPerm, DocTypeMeta, FieldDef, RoleName } from '../meta/types';

export interface RoleGrant {
  role: RoleName;
  orgId: string;
  /** true: applies to orgId and every org below it. false: orgId only. */
  withDescendants: boolean;
}

export interface UserContext {
  uid: string;
  personId: string | null;
  grants: readonly RoleGrant[];
}

export interface DocContext {
  /** Ancestors from the root, ending with the doc's own org. */
  orgPath: readonly string[];
  ownerPersonId?: string | null;
}

export type Action = 'read' | 'write' | 'create' | 'delete';

export function grantApplies(grant: RoleGrant, orgPath: readonly string[]): boolean {
  if (orgPath.length === 0) return false;
  return grant.withDescendants ? orgPath.includes(grant.orgId) : orgPath[orgPath.length - 1] === grant.orgId;
}

export function effectiveRoles(user: UserContext, doc: DocContext): Set<RoleName> {
  const roles = new Set<RoleName>();
  for (const g of user.grants) if (grantApplies(g, doc.orgPath)) roles.add(g.role);
  return roles;
}

function rowMatches(row: DocPerm, roles: Set<RoleName>, user: UserContext, doc: DocContext): boolean {
  if (!roles.has(row.role)) return false;
  if (row.ifOwner) return user.personId !== null && doc.ownerPersonId === user.personId;
  return true;
}

export function can(meta: DocTypeMeta, user: UserContext, action: Action, doc: DocContext): boolean {
  const roles = effectiveRoles(user, doc);
  return meta.permissions.some((row) => (row.permlevel ?? 0) === 0 && row[action] === true && rowMatches(row, roles, user, doc));
}

export function permittedLevels(meta: DocTypeMeta, user: UserContext, action: 'read' | 'write', doc: DocContext): Set<number> {
  const roles = effectiveRoles(user, doc);
  const levels = new Set<number>();
  for (const row of meta.permissions) {
    if (row[action] === true && rowMatches(row, roles, user, doc)) levels.add(row.permlevel ?? 0);
  }
  // Frappe semantics: higher permlevels only apply on top of level-0 access for the same action.
  return levels.has(0) ? levels : new Set<number>();
}

export function readableFields(meta: DocTypeMeta, fields: readonly FieldDef[], user: UserContext, doc: DocContext): FieldDef[] {
  const levels = permittedLevels(meta, user, 'read', doc);
  return fields.filter((f) => levels.has(f.permlevel ?? 0));
}

/** Top-level keys of a patch, with custom values expanded to 'custom.<name>'. */
export function patchKeys(patch: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'custom' && v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const ck of Object.keys(v)) keys.push(`custom.${ck}`);
    } else {
      keys.push(k);
    }
  }
  return keys;
}

/**
 * Keys in the patch the user may not write (readOnly or above their write permlevels).
 * Unknown keys are ignored here; schema validation rejects them.
 */
export function unwritableKeys(
  meta: DocTypeMeta,
  fields: readonly FieldDef[],
  user: UserContext,
  doc: DocContext,
  patch: Record<string, unknown>,
): string[] {
  const levels = permittedLevels(meta, user, 'write', doc);
  const byKey = new Map(fields.map((f) => [fieldKey(f), f]));
  return patchKeys(patch).filter((key) => {
    const f = byKey.get(key);
    if (!f) return false;
    return f.readOnly === true || !levels.has(f.permlevel ?? 0);
  });
}
