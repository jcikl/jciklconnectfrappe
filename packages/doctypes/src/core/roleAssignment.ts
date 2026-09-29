import { defineDocType, grantApplies, ROLE_ASSIGNMENT_DOCTYPE, ROLES, ValidationError, type Controller, type HookContext } from '@jci/core';

/** Grants `role` to the user `uid` at the document's org (orgId), and below it when withDescendants. */
export const RoleAssignment = defineDocType({
  name: ROLE_ASSIGNMENT_DOCTYPE,
  module: 'core',
  collection: 'roleAssignments',
  titleField: 'role',
  listFields: ['uid', 'role', 'withDescendants'],
  searchFields: ['uid'],
  fields: [
    { fieldname: 'uid', label: 'User ID', fieldtype: 'Data', reqd: true },
    { fieldname: 'role', label: 'Role', fieldtype: 'Select', options: ROLES, reqd: true },
    { fieldname: 'withDescendants', label: 'Includes child organisations', fieldtype: 'Check' },
  ],
  permissions: [
    { role: 'SystemManager', read: true, write: true, create: true, delete: true },
    { role: 'OrgAdmin', read: true, write: true, create: true, delete: true },
  ],
});

/** True when a System Manager grant applies to this org; a missing orgPath is covered by nothing. */
const isSystemManager = (ctx: HookContext): boolean =>
  ctx.user.grants.some((g) => g.role === 'SystemManager' && grantApplies(g, ctx.orgPath ?? []));

/**
 * True when the caller holds a subtree System Manager or OrgAdmin grant covering this org; a missing orgPath
 * is covered by nothing. An exact grant, even a System Manager one, cannot hand out or change subtree grants.
 */
const coversSubtree = (ctx: HookContext): boolean =>
  ctx.user.grants.some(
    (g) => (g.role === 'SystemManager' || g.role === 'OrgAdmin') && g.withDescendants && grantApplies(g, ctx.orgPath ?? []),
  );

export const roleAssignmentController: Controller = {
  validate(ctx) {
    const touchesSystemManager = ctx.doc.role === 'SystemManager' || ctx.before?.role === 'SystemManager';
    if (touchesSystemManager && !isSystemManager(ctx)) {
      throw new ValidationError('Only a System Manager can grant or change the System Manager role', 'role');
    }
    if (ctx.doc.withDescendants === true && !coversSubtree(ctx)) {
      throw new ValidationError('You can only grant a role over child organisations that you administer', 'withDescendants');
    }
    // Narrower admins must not alter or downgrade an existing subtree grant.
    if (ctx.before?.withDescendants === true && !coversSubtree(ctx)) {
      throw new ValidationError('You can only change a role over child organisations that you administer', 'withDescendants');
    }
  },
  beforeDelete(ctx) {
    if (ctx.before?.role === 'SystemManager' && !isSystemManager(ctx)) {
      throw new ValidationError('Only a System Manager can remove the System Manager role', 'role');
    }
    if (ctx.before?.withDescendants === true && !coversSubtree(ctx)) {
      throw new ValidationError('You can only remove a role over child organisations that you administer', 'withDescendants');
    }
  },
};
