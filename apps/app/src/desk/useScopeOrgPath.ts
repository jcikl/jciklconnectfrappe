import { useDocument } from '@jci/client/react';
import { ORGANIZATION_DOCTYPE } from '@jci/core';
import { registry } from '@jci/doctypes';
import { useDesk } from './DeskContext';

const ORGANIZATIONS = registry.get(ORGANIZATION_DOCTYPE).collection;

/** The Desk scope org's orgPath: undefined while it loads, null when there is no scope or it cannot be read. */
export function useScopeOrgPath(): string[] | null | undefined {
  const { scope } = useDesk();
  const org = useDocument(scope ? ORGANIZATIONS : null, scope?.orgId ?? null);
  if (!scope) return null;
  if (org.status === 'loading') return undefined;
  const path = org.status === 'ready' ? org.doc?.data.orgPath : undefined;
  return Array.isArray(path) ? (path as string[]) : null;
}
