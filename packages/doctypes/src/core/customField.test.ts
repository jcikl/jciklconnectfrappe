import type { HookContext } from '@jci/core';
import { describe, expect, it } from 'vitest';
import { CustomField, customFieldController } from './customField';
import { hookContext, systemManager, userWith } from './testContext';

const klAdmin = userWith(['OrgAdmin', 'jci-kl', false]);
const motto = { targetDocType: 'Organization', fieldname: 'motto', label: 'Motto', fieldtype: 'Data', org: 'jci-kl' };
const validate = async (doc: Record<string, unknown>, extra: Partial<HookContext> = {}) =>
  customFieldController.validate!(hookContext(CustomField, doc, { user: klAdmin, ...extra }));

describe('CustomField', () => {
  it('is a global DocType named after its target and fieldname', () => {
    expect(CustomField.orgScoped).toBe(false);
    expect(CustomField.naming).toEqual({ kind: 'fields', fields: ['targetDocType', 'fieldname'] });
  });

  it('accepts a valid field from an admin of the org', async () => {
    await expect(validate(motto)).resolves.toBeUndefined();
    await expect(validate({ ...motto, fieldname: 'twin', fieldtype: 'Link', link: 'Organization' })).resolves.toBeUndefined();
  });

  it('rejects unknown targets, bad definitions and unknown link targets', async () => {
    await expect(validate({ ...motto, targetDocType: 'Nope' })).rejects.toMatchObject({ field: 'targetDocType' });
    await expect(validate({ ...motto, fieldname: 'title' })).rejects.toThrow(/collides/);
    await expect(validate({ ...motto, fieldtype: 'Select' })).rejects.toThrow(/options/);
    await expect(validate({ ...motto, fieldtype: 'Link', link: 'Nope' })).rejects.toMatchObject({ field: 'link' });
  });

  it('requires the author to administer the org', async () => {
    await expect(validate({ ...motto, org: 'jci-malaysia' })).rejects.toMatchObject({ field: 'org' });
    await expect(validate({ ...motto, org: 'nowhere' })).rejects.toMatchObject({ field: 'org' });
    await expect(validate({ ...motto, org: 'jci-malaysia' }, { user: systemManager })).resolves.toBeUndefined();
  });

  it('leaves fields on global DocTypes to System Managers', async () => {
    const onGlobal = { ...motto, targetDocType: 'CustomField', fieldname: 'note' };
    await expect(validate(onGlobal)).rejects.toMatchObject({ field: 'org' });
    await expect(validate(onGlobal, { user: systemManager })).resolves.toBeUndefined();
  });

  it('keeps the identity and type fixed after creation', async () => {
    const update = { isNew: false, before: motto };
    await expect(validate({ ...motto, fieldtype: 'Text' }, update)).rejects.toMatchObject({ field: 'fieldtype' });
    await expect(validate({ ...motto, label: 'Our motto' }, update)).resolves.toBeUndefined();
  });

  it('checks the admin on delete too', async () => {
    const before = { ...motto, org: 'jci-malaysia' };
    await expect(customFieldController.beforeDelete!(hookContext(CustomField, before, { user: klAdmin, isNew: false, before }))).rejects.toMatchObject({
      field: 'org',
    });
  });
});
