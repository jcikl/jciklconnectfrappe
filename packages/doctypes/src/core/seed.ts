import { buildOrgPath, type OrgLevel } from '@jci/core';

export interface SeedOrg {
  code: string;
  title: string;
  level: OrgLevel;
  parent: string | null;
}

/** The org tree for the first launch (spec: Phase 1 DocTypes → Organization). Parents come first. */
export const SEED_ORGS: readonly SeedOrg[] = [
  { code: 'jci', title: 'JCI', level: 'hq', parent: null },
  { code: 'jci-asia-pacific', title: 'JCI Asia Pacific', level: 'area', parent: 'jci' },
  { code: 'jci-malaysia', title: 'JCI Malaysia', level: 'national', parent: 'jci-asia-pacific' },
  { code: 'jci-malaysia-central', title: 'JCI Malaysia Area Central', level: 'national_area', parent: 'jci-malaysia' },
  { code: 'jci-kl', title: 'JCI Kuala Lumpur', level: 'local', parent: 'jci-malaysia-central' },
];

/** Stored Organization documents for a parent-first list of orgs. */
export function orgDocs(orgs: readonly SeedOrg[]): Record<string, unknown>[] {
  const paths = new Map<string, string[]>();
  return orgs.map((o) => {
    const parentPath = o.parent === null ? null : paths.get(o.parent);
    if (parentPath === undefined) throw new Error(`Parent "${o.parent}" must come before "${o.code}"`);
    const orgPath = buildOrgPath(parentPath, o.code);
    paths.set(o.code, orgPath);
    return { id: o.code, code: o.code, title: o.title, level: o.level, parent: o.parent, orgId: o.code, orgPath };
  });
}
