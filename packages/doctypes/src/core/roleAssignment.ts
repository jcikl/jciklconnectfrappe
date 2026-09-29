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

const isSystemManager = (ctx: HookContext): boolean => ctx.user.grants.some((g) => g.role === 'SystemManager');

export const roleAssignmentController: Controller = {
  validate(ctx) {
    const touchesSystemManager = ctx.doc.role === 'SystemManager' || ctx.before?.role === 'SystemManager';
    if (touchesSystemManager && !isSystemManager(ctx)) {
      throw new ValidationError('Only a System Manager can grant or change the System Manager role', 'role');
    }
    if (ctx.doc.withDescendants === true && !isSystemManager(ctx)) {
      const covers = ctx.user.grants.some((g) => g.role === 'OrgAdmin' && g.withDescendants && grantApplies(g, ctx.orgPath));
      if (!covers) {
        throw new ValidationError('You can only grant a role over child organisations that you administer', 'withDescendants');
      }
    }
  },
  beforeDelete(ctx) {
    if (ctx.before?.role === 'SystemManager' && !isSystemManager(ctx)) {
      throw new ValidationError('Only a System Manager can remove the System Manager role', 'role');
    }
  },
};
