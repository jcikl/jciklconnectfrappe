export const ORG_LEVELS = ['hq', 'area', 'national', 'national_area', 'local'] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];

const ALLOWED_PARENTS: Record<OrgLevel, readonly OrgLevel[]> = {
  hq: [],
  area: ['hq'],
  national: ['area'],
  national_area: ['national'],
  local: ['national_area', 'national'],
};

export function canBeChildOf(child: OrgLevel, parent: OrgLevel | null): boolean {
  if (parent === null) return child === 'hq';
  return ALLOWED_PARENTS[child].includes(parent);
}

/** orgPath = ancestor ids from the root down, ending with the org's own id. */
export function buildOrgPath(parentPath: readonly string[] | null, orgId: string): string[] {
  if (!orgId) throw new Error('orgId must not be empty');
  const base = parentPath ?? [];
  if (base.includes(orgId)) throw new Error(`orgPath cycle: "${orgId}" is already an ancestor`);
  return [...base, orgId];
}

export function isWithin(orgPath: readonly string[], orgId: string): boolean {
  return orgPath.includes(orgId);
}

export function ownOrgId(orgPath: readonly string[]): string {
  const last = orgPath[orgPath.length - 1];
  if (last === undefined) throw new Error('orgPath is empty');
  return last;
}
