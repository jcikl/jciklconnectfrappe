import type { HookContext } from '@jci/core';
import { describe, expect, it } from 'vitest';
import { RoleAssignment, roleAssignmentController } from './roleAssignment';
import { hookContext, PJ_PATH, systemManager, userWith } from './testContext';

const pjAdmin = userWith(['OrgAdmin', 'jci-pj', false]);
const nationalAdmin = userWith(['OrgAdmin', 'jci-malaysia', true]);
const at = (user = pjAdmin, extra: Partial<HookContext> = {}) => ({ user, orgPath: PJ_PATH, ...extra });
const validate = async (doc: Record<string, unknown>, extra: Partial<HookContext>) =>
  roleAssignmentController.validate!(hookContext(RoleAssignment, doc, extra));
const beforeDelete = async (before: Record<string, unknown>, extra: Partial<HookContext>) =>
  roleAssignmentController.beforeDelete!(hookContext(RoleAssignment, before, { ...extra, isNew: false, before }));

describe('RoleAssignment', () => {
  it('lets an org admin grant ordinary roles at their org', async () => {
    await expect(validate({ uid: 'x', role: 'Member' }, at())).resolves.toBeUndefined();
  });

  it('reserves the System Manager role for System Managers', async () => {
    await expect(validate({ uid: 'x', role: 'SystemManager' }, at())).rejects.toMatchObject({ field: 'role' });
    await expect(
      validate({ uid: 'x', role: 'Member' }, at(pjAdmin, { isNew: false, before: { uid: 'x', role: 'SystemManager' } })),
    ).rejects.toMatchObject({ field: 'role' });
    await expect(validate({ uid: 'x', role: 'SystemManager', withDescendants: true }, at(systemManager))).resolves.toBeUndefined();
  });

  it('allows subtree grants only from admins who cover the subtree', async () => {
    await expect(validate({ uid: 'x', role: 'Member', withDescendants: true }, at())).rejects.toMatchObject({ field: 'withDescendants' });
    await expect(validate({ uid: 'x', role: 'Member', withDescendants: true }, at(nationalAdmin))).resolves.toBeUndefined();
  });

  it('stops non-System-Managers removing a System Manager', async () => {
    await expect(beforeDelete({ uid: 'x', role: 'SystemManager' }, at())).rejects.toMatchObject({ field: 'role' });
    await expect(beforeDelete({ uid: 'x', role: 'Member' }, at())).resolves.toBeUndefined();
  });
});
