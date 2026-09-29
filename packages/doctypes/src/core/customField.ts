import {
  CUSTOM_FIELD_DOCTYPE,
  customFieldFromDoc,
  defineDocType,
  effectiveRoles,
  FIELD_TYPES,
  MetaError,
  ORGANIZATION_DOCTYPE,
  validateCustomField,
  ValidationError,
  type Controller,
  type HookContext,
} from '@jci/core';

export const CUSTOM_FIELD_TYPES = FIELD_TYPES.filter((t) => t !== 'Table');

/**
 * A field an admin adds to a DocType for their org and every org below it.
 * Global, so every role holder can read definitions made at ancestor orgs; the controller checks the author.
 */
export const CustomField = defineDocType({
  name: CUSTOM_FIELD_DOCTYPE,
  module: 'core',
  collection: 'customFields',
  orgScoped: false,
  naming: { kind: 'fields', fields: ['targetDocType', 'fieldname'] },
  titleField: 'label',
  listFields: ['targetDocType', 'fieldname', 'fieldtype', 'org'],
  searchFields: ['label', 'fieldname'],
  fields: [
    { fieldname: 'targetDocType', label: 'DocType', fieldtype: 'Data', reqd: true },
    { fieldname: 'fieldname', label: 'Field name', fieldtype: 'Data', reqd: true },
    { fieldname: 'label', label: 'Label', fieldtype: 'Data', reqd: true },
    { fieldname: 'fieldtype', label: 'Type', fieldtype: 'Select', options: CUSTOM_FIELD_TYPES, reqd: true },
    { fieldname: 'org', label: 'Organisation', fieldtype: 'Link', link: ORGANIZATION_DOCTYPE, reqd: true },
    { fieldname: 'options', label: 'Options (one per line)', fieldtype: 'Text' },
    { fieldname: 'link', label: 'Links to', fieldtype: 'Data' },
    { fieldname: 'permlevel', label: 'Permission level', fieldtype: 'Int' },
    { fieldname: 'reqd', label: 'Required', fieldtype: 'Check' },
  ],
  permissions: [
    { role: 'SystemManager', read: true, write: true, create: true, delete: true },
    { role: 'OrgAdmin', read: true, write: true, create: true, delete: true },
    { role: 'MembershipOfficer', read: true },
    { role: 'Treasurer', read: true },
    { role: 'BoardMember', read: true },
    { role: 'Member', read: true },
  ],
});

const FIXED_AFTER_CREATE = ['targetDocType', 'fieldname', 'fieldtype', 'org'] as const;

async function assertAdministers(ctx: HookContext, orgId: unknown, targetIsOrgScoped: boolean): Promise<void> {
  const org = typeof orgId === 'string' ? await ctx.get(ORGANIZATION_DOCTYPE, orgId) : null;
  if (!org || !Array.isArray(org.orgPath)) throw new ValidationError('Unknown organisation', 'org');
  const orgPath = org.orgPath as string[];
  if (targetIsOrgScoped) {
    const roles = effectiveRoles(ctx.user, { orgPath });
    if (roles.has('SystemManager') || roles.has('OrgAdmin')) return;
  } else if (ctx.user.grants.some((g) => g.role === 'SystemManager' && g.withDescendants && g.orgId === orgPath[0])) {
    // A field on a global DocType applies platform-wide, so it needs a System Manager over the whole tree.
    return;
  }
  throw new ValidationError(
    targetIsOrgScoped ? 'You must administer this organisation' : 'Only a System Manager can add fields to this DocType',
    'org',
  );
}

export const customFieldController: Controller = {
  async validate(ctx) {
    const target = String(ctx.doc.targetDocType);
    if (!ctx.registry.has(target) || ctx.registry.get(target).isChild) {
      throw new ValidationError(`Unknown DocType "${target}"`, 'targetDocType');
    }
    const meta = ctx.registry.get(target);
    const field = customFieldFromDoc(ctx.doc);
    try {
      validateCustomField(meta, field);
    } catch (err) {
      if (err instanceof MetaError) throw new ValidationError(err.message);
      throw err;
    }
    if (field.fieldtype === 'Link' && !ctx.registry.has(field.link!)) {
      throw new ValidationError(`Unknown DocType "${field.link}"`, 'link');
    }
    if (!ctx.isNew) {
      for (const key of FIXED_AFTER_CREATE) {
        if (ctx.doc[key] !== ctx.before?.[key]) throw new ValidationError('This cannot change after the field is created', key);
      }
    }
    await assertAdministers(ctx, ctx.doc.org, meta.orgScoped);
  },
  async beforeDelete(ctx) {
    const target = String(ctx.before?.targetDocType);
    const orgScoped = ctx.registry.has(target) ? ctx.registry.get(target).orgScoped : true;
    await assertAdministers(ctx, ctx.before?.org, orgScoped);
  },
};
