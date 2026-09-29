import { canBeChildOf, defineDocType, ORG_LEVELS, ORGANIZATION_DOCTYPE, ValidationError, type Controller, type OrgLevel } from '@jci/core';

export const Organization = defineDocType({
  name: ORGANIZATION_DOCTYPE,
  module: 'core',
  collection: 'organizations',
  naming: { kind: 'field', field: 'code' },
  titleField: 'title',
  listFields: ['title', 'level'],
  searchFields: ['title', 'code'],
  fields: [
    { fieldname: 'code', label: 'Code', fieldtype: 'Data', reqd: true },
    { fieldname: 'title', label: 'Name', fieldtype: 'Data', reqd: true },
    { fieldname: 'level', label: 'Level', fieldtype: 'Select', options: ORG_LEVELS, reqd: true },
    // Set by the save pipeline from the create request's orgId.
    { fieldname: 'parent', label: 'Parent', fieldtype: 'Link', link: ORGANIZATION_DOCTYPE, readOnly: true },
    { fieldname: 'currency', label: 'Currency', fieldtype: 'Data' },
    { fieldname: 'timezone', label: 'Time zone', fieldtype: 'Data' },
  ],
  permissions: [
    { role: 'SystemManager', read: true, write: true, create: true, delete: true },
    { role: 'OrgAdmin', read: true, write: true, create: true },
    { role: 'MembershipOfficer', read: true },
    { role: 'Treasurer', read: true },
    { role: 'BoardMember', read: true },
    { role: 'Member', read: true },
  ],
});

const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const organizationController: Controller = {
  async validate(ctx) {
    if (!ctx.isNew) {
      if (ctx.doc.code !== ctx.before?.code) throw new ValidationError('The code cannot change', 'code');
      if (ctx.doc.level !== ctx.before?.level) throw new ValidationError('The level cannot change', 'level');
      return;
    }
    if (!CODE.test(String(ctx.doc.code))) {
      throw new ValidationError('Use lowercase letters and digits, separated by single hyphens', 'code');
    }
    const level = ctx.doc.level as OrgLevel;
    const parent = typeof ctx.doc.parent === 'string' ? await ctx.get(ORGANIZATION_DOCTYPE, ctx.doc.parent) : null;
    const parentLevel = (parent?.level as OrgLevel | undefined) ?? null;
    if (!canBeChildOf(level, parentLevel)) {
      throw new ValidationError(
        parentLevel ? `A ${level} organisation cannot sit under a ${parentLevel}` : `A ${level} organisation needs a parent`,
        'level',
      );
    }
  },
};
