import { createRegistry, type DocTypeMeta, type HookContext, type RoleName, type StoredDoc, type UserContext } from '@jci/core';
import { CustomField } from './customField';
import { Organization } from './organization';
import { RoleAssignment } from './roleAssignment';
import { orgDocs, SEED_ORGS } from './seed';

/** Test-only helpers for controller unit tests. Not exported from the package. */
export const registry = createRegistry([Organization, RoleAssignment, CustomField]);
export const KL_PATH = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];
export const PJ_PATH = [...KL_PATH.slice(0, 4), 'jci-pj'];

const store: Record<string, StoredDoc> = Object.fromEntries(
  orgDocs([...SEED_ORGS, { code: 'jci-pj', title: 'JCI Petaling Jaya', level: 'local', parent: 'jci-malaysia-central' }]).map(
    (o) => [`Organization/${String(o.id)}`, o],
  ),
);

export function userWith(...grants: [RoleName, string, boolean][]): UserContext {
  return { uid: 'u-test', personId: null, grants: grants.map(([role, orgId, withDescendants]) => ({ role, orgId, withDescendants })) };
}

export const systemManager = userWith(['SystemManager', 'jci', true]);

export function hookContext(
  meta: DocTypeMeta,
  doc: Record<string, unknown>,
  extra: Partial<Omit<HookContext, 'meta' | 'doc'>> = {},
): HookContext {
  return {
    meta,
    registry,
    user: systemManager,
    isNew: true,
    id: 'test-id',
    orgPath: null,
    before: null,
    doc,
    get: async (doctype, id) => store[`${doctype}/${id}`] ?? null,
    ...extra,
  };
}
