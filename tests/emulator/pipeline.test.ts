import { controllers } from '@jci/doctypes';
import { Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDoc, deleteDoc, updateDoc, type EffectContext, type PipelineDeps } from '../../netlify/functions/_shared/pipeline';
import { KL, NOW, seedOrgs, testRegistry, users } from './fixtures';
import { testProject } from './helpers';

const project = testProject('demo-jci-pipeline');
const deps: PipelineDeps = { db: project.db, registry: testRegistry, controllers, now: () => NOW };

beforeEach(async () => {
  await project.clear();
  await seedOrgs(project.db);
});
afterAll(() => project.close());

const stored = async (collection: string, id: string) => (await project.db.collection(collection).doc(id).get()).data();
const versions = async (docId: string) =>
  (await project.db.collection('versions').where('docId', '==', docId).get()).docs.map((d) => d.data());

/** A Person in jci-kl created by the officer, then re-owned by `owner`. */
async function seedPerson(owner = 'p1', data: Record<string, unknown> = {}): Promise<string> {
  const r = await createDoc(deps, users.officer, 'Person', {
    orgId: 'jci-kl',
    data: { fullName: 'Tan', phone: '1', membershipType: 'Probation', ...data },
  });
  await project.db.collection('persons').doc(r.id).update({ ownerPersonId: owner });
  return r.id;
}

describe('createDoc', () => {
  it('stores system fields, a series id and a create version', async () => {
    const r = await createDoc(deps, users.officer, 'Person', { orgId: 'jci-kl', data: { fullName: '  Tan Ah Kow ', phone: '012' } });
    expect(r.id).toBe('PER-2026-00001');
    expect(await stored('persons', r.id)).toMatchObject({
      id: r.id,
      fullName: 'Tan Ah Kow',
      phone: '012',
      orgId: 'jci-kl',
      orgPath: KL,
      ownerPersonId: 'p-officer',
      createdAt: Timestamp.fromDate(NOW),
      createdBy: 'u-officer',
      updatedAt: Timestamp.fromDate(NOW),
      updatedBy: 'u-officer',
    });
    expect(r.doc).toMatchObject({ id: r.id, fullName: 'Tan Ah Kow', createdAt: NOW.toISOString() });
    expect(await versions(r.id)).toEqual([
      expect.objectContaining({
        doctype: 'Person',
        docId: r.id,
        action: 'create',
        by: 'u-officer',
        orgId: 'jci-kl',
        orgPath: KL,
        ownerPersonId: 'p-officer',
        changed: [
          { field: 'fullName', old: null, new: 'Tan Ah Kow' },
          { field: 'phone', old: null, new: '012' },
        ],
      }),
    ]);
  });

  it('rejects callers without create permission at that org', async () => {
    await expect(createDoc(deps, users.member, 'Person', { orgId: 'jci-kl', data: { fullName: 'A' } })).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    await expect(createDoc(deps, users.officer, 'Person', { orgId: 'jci-singapore', data: { fullName: 'A' } })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('requires a known orgId for org-scoped DocTypes', async () => {
    await expect(createDoc(deps, users.officer, 'Person', { data: { fullName: 'A' } })).rejects.toMatchObject({
      status: 400,
      code: 'org_required',
    });
    await expect(createDoc(deps, users.officer, 'Person', { orgId: 'nowhere', data: { fullName: 'A' } })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('rejects unknown DocTypes, child DocTypes and non-object data', async () => {
    await expect(createDoc(deps, users.admin, 'Nope', { orgId: 'jci-kl', data: {} })).rejects.toMatchObject({
      status: 404,
      code: 'unknown_doctype',
    });
    await expect(createDoc(deps, users.admin, 'PersonHistory', { orgId: 'jci-kl', data: {} })).rejects.toMatchObject({ status: 404 });
    await expect(createDoc(deps, users.admin, 'Person', { orgId: 'jci-kl', data: [] })).rejects.toMatchObject({ status: 400 });
  });

  it('validates data against the schema, including unknown keys', async () => {
    await expect(createDoc(deps, users.officer, 'Person', { orgId: 'jci-kl', data: { phone: '1' } })).rejects.toMatchObject({
      status: 422,
      code: 'invalid',
      details: { issues: expect.arrayContaining([expect.objectContaining({ path: 'fullName' })]) },
    });
    await expect(
      createDoc(deps, users.officer, 'Person', { orgId: 'jci-kl', data: { fullName: 'A', orgPath: ['x'] } }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await project.db.collection('series').get()).size).toBe(0);
  });

  it('rejects readOnly fields', async () => {
    await expect(createDoc(deps, users.officer, 'Person', { orgId: 'jci-kl', data: { fullName: 'A', authUid: 'x' } })).rejects.toMatchObject({
      status: 403,
      code: 'field_not_writable',
      details: { fields: ['authUid'] },
    });
  });

  it('creates an Organization under its parent with its own orgPath', async () => {
    const r = await createDoc(deps, users.admin, 'Organization', {
      orgId: 'jci-malaysia-central',
      data: { code: 'jci-ipoh', title: 'JCI Ipoh', level: 'local' },
    });
    expect(r.id).toBe('jci-ipoh');
    expect(r.doc).toMatchObject({ parent: 'jci-malaysia-central', orgId: 'jci-ipoh', orgPath: [...KL.slice(0, 4), 'jci-ipoh'] });
  });

  it('runs controller validation and refuses taken ids and a client-set parent', async () => {
    await expect(
      createDoc(deps, users.admin, 'Organization', { orgId: 'jci-malaysia-central', data: { code: 'jci-x', title: 'X', level: 'national' } }),
    ).rejects.toMatchObject({ status: 422, details: { issues: [{ path: 'level' }] } });
    await expect(
      createDoc(deps, users.admin, 'Organization', { orgId: 'jci-malaysia-central', data: { code: 'jci-kl', title: 'Dup', level: 'local' } }),
    ).rejects.toMatchObject({ status: 409, code: 'exists' });
    await expect(
      createDoc(deps, users.admin, 'Organization', {
        orgId: 'jci-malaysia-central',
        data: { code: 'jci-y', title: 'Y', level: 'local', parent: 'jci' },
      }),
    ).rejects.toMatchObject({ status: 403, code: 'field_not_writable', details: { fields: ['parent'] } });
  });

  it('creates global DocTypes without org fields, and applies their custom fields', async () => {
    const field = await createDoc(deps, users.admin, 'CustomField', {
      data: { targetDocType: 'Person', fieldname: 'shirtSize', label: 'Shirt size', fieldtype: 'Select', options: 'S\nM\nL', org: 'jci-malaysia' },
    });
    expect(field.id).toBe('Person.shirtSize');
    expect(await stored('customFields', field.id)).not.toHaveProperty('orgPath');

    const p = await createDoc(deps, users.officer, 'Person', { orgId: 'jci-kl', data: { fullName: 'A', custom: { shirtSize: 'M' } } });
    expect(p.doc.custom).toEqual({ shirtSize: 'M' });
    await expect(
      createDoc(deps, users.officer, 'Person', { orgId: 'jci-kl', data: { fullName: 'B', custom: { shirtSize: 'XXL' } } }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      createDoc(deps, users.admin, 'CustomField', {
        orgId: 'jci',
        data: { targetDocType: 'Person', fieldname: 'x', label: 'X', fieldtype: 'Data', org: 'jci' },
      }),
    ).rejects.toMatchObject({ status: 400, code: 'bad_request' });
  });

  it('lets only administrators of the org add custom fields', async () => {
    const def = (fieldname: string, org: string) => ({ data: { targetDocType: 'Person', fieldname, label: fieldname, fieldtype: 'Data', org } });
    await expect(createDoc(deps, users.pjAdmin, 'CustomField', def('klOnly', 'jci-kl'))).rejects.toMatchObject({
      status: 422,
      details: { issues: [{ path: 'org' }] },
    });
    expect((await createDoc(deps, users.pjAdmin, 'CustomField', def('pjOnly', 'jci-pj'))).id).toBe('Person.pjOnly');
  });
});

describe('updateDoc', () => {
  it('applies a patch, keeps system fields and records an update version', async () => {
    const id = await seedPerson();
    const later = new Date('2026-10-01T00:00:00Z');
    const r = await updateDoc({ ...deps, now: () => later }, users.officer, 'Person', id, { data: { phone: '2' } });
    expect(r.changed).toEqual([['phone', '1', '2']]);
    expect(await stored('persons', id)).toMatchObject({
      fullName: 'Tan',
      phone: '2',
      orgPath: KL,
      createdBy: 'u-officer',
      ownerPersonId: 'p1',
      updatedAt: Timestamp.fromDate(later),
    });
    const update = (await versions(id)).find((v) => v.action === 'update');
    expect(update).toMatchObject({ changed: [{ field: 'phone', old: '1', new: '2' }], ownerPersonId: 'p1', by: 'u-officer' });
  });

  it('writes nothing when nothing changes', async () => {
    const id = await seedPerson();
    const r = await updateDoc(deps, users.officer, 'Person', id, { data: { phone: '1' } });
    expect(r.changed).toEqual([]);
    expect(await versions(id)).toHaveLength(1);
  });

  it('lets a member edit only the level-0 fields of their own record', async () => {
    const id = await seedPerson('p1');
    await updateDoc(deps, users.member, 'Person', id, { data: { phone: '3', membershipType: 'Probation' } });
    await expect(updateDoc(deps, users.member, 'Person', id, { data: { membershipType: 'Official' } })).rejects.toMatchObject({
      status: 403,
      code: 'field_not_writable',
      details: { fields: ['membershipType'] },
    });
    const other = await seedPerson('p9');
    await expect(updateDoc(deps, users.member, 'Person', other, { data: { phone: '3' } })).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
  });

  it('answers 404 for missing documents and documents outside the caller scope', async () => {
    const id = await seedPerson();
    await expect(updateDoc(deps, users.outsider, 'Person', id, { data: { phone: '3' } })).rejects.toMatchObject({ status: 404 });
    await expect(updateDoc(deps, users.officer, 'Person', 'PER-2026-99999', { data: {} })).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    await expect(updateDoc(deps, users.officer, 'Person', 'a/b', { data: {} })).rejects.toMatchObject({ status: 404 });
  });

  it('merges custom values one level deep and refuses to null reqd fields', async () => {
    for (const fieldname of ['shirtSize', 'nickname']) {
      await createDoc(deps, users.admin, 'CustomField', {
        data: { targetDocType: 'Person', fieldname, label: fieldname, fieldtype: 'Data', org: 'jci-kl' },
      });
    }
    const id = await seedPerson('p1', { custom: { shirtSize: 'M', nickname: 'Ah Kow' } });
    const r = await updateDoc(deps, users.officer, 'Person', id, { data: { custom: { shirtSize: 'L' } } });
    expect(r.changed).toEqual([['custom.shirtSize', 'M', 'L']]);
    expect((await stored('persons', id))?.custom).toEqual({ shirtSize: 'L', nickname: 'Ah Kow' });
    await expect(updateDoc(deps, users.officer, 'Person', id, { data: { fullName: null } })).rejects.toMatchObject({ status: 422 });
  });

  it('runs controller validation on update', async () => {
    await expect(updateDoc(deps, users.admin, 'Organization', 'jci-kl', { data: { level: 'national_area' } })).rejects.toMatchObject({
      status: 422,
      details: { issues: [{ path: 'level' }] },
    });
  });
});

describe('deleteDoc', () => {
  it('deletes the document and records a delete version', async () => {
    const id = await seedPerson();
    await deleteDoc(deps, users.officer, 'Person', id);
    expect(await stored('persons', id)).toBeUndefined();
    const del = (await versions(id)).find((v) => v.action === 'delete');
    expect(del?.changed).toContainEqual({ field: 'fullName', old: 'Tan', new: null });
  });

  it('requires delete permission and hides out-of-scope documents', async () => {
    const id = await seedPerson();
    await expect(deleteDoc(deps, users.member, 'Person', id)).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(deleteDoc(deps, users.outsider, 'Person', id)).rejects.toMatchObject({ status: 404 });
  });

  it('runs beforeDelete hooks', async () => {
    const r = await createDoc(deps, users.admin, 'RoleAssignment', { orgId: 'jci-pj', data: { uid: 'x', role: 'SystemManager' } });
    await expect(deleteDoc(deps, users.pjAdmin, 'RoleAssignment', r.id)).rejects.toMatchObject({
      status: 422,
      details: { issues: [{ path: 'role' }] },
    });
  });
});

describe('effects', () => {
  it('run after commit with the stored documents before and after', async () => {
    const seen: EffectContext[] = [];
    const withEffect: PipelineDeps = { ...deps, effects: { Person: async (ctx) => void seen.push(ctx) } };
    const r = await createDoc(withEffect, users.officer, 'Person', { orgId: 'jci-kl', data: { fullName: 'A' } });
    await updateDoc(withEffect, users.officer, 'Person', r.id, { data: { fullName: 'A' } });
    await deleteDoc(withEffect, users.officer, 'Person', r.id);
    expect(seen.map((c) => [c.before?.fullName ?? null, c.after?.fullName ?? null])).toEqual([
      [null, 'A'],
      ['A', null],
    ]);
  });

  it('report a failed effect without undoing the save', async () => {
    const failing: PipelineDeps = {
      ...deps,
      effects: {
        Person: async () => {
          throw new Error('boom');
        },
      },
    };
    await expect(createDoc(failing, users.officer, 'Person', { orgId: 'jci-kl', data: { fullName: 'A' } })).rejects.toMatchObject({
      status: 500,
      code: 'effect_failed',
    });
    expect((await project.db.collection('persons').get()).size).toBe(1);
  });
});
