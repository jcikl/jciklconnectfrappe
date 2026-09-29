import { CustomField, Organization, RoleAssignment } from '@jci/doctypes';
import { Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { datePartsIn, planId } from '../../netlify/functions/_shared/naming';
import { loadCustomFields, loadOrgPath, serializeDoc } from '../../netlify/functions/_shared/store';
import { KL, NOW, Person, putDoc, seedOrgs, testRegistry } from './fixtures';
import { testProject } from './helpers';

const project = testProject('demo-jci-store');
const deps = { db: project.db, registry: testRegistry };
const date = { year: 2026, month: 9, day: 29 };

beforeEach(async () => {
  await project.clear();
  await seedOrgs(project.db);
});
afterAll(() => project.close());

describe('datePartsIn', () => {
  it('reads the calendar date in the given time zone', () => {
    const lateUtc = new Date('2026-12-31T16:30:00Z');
    expect(datePartsIn('Asia/Kuala_Lumpur', lateUtc)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(datePartsIn('UTC', lateUtc)).toEqual({ year: 2026, month: 12, day: 31 });
  });
});

describe('planId', () => {
  it('counts a naming series across transactions', async () => {
    const next = () =>
      project.db.runTransaction(async (tx) => {
        const planned = await planId(tx, project.db, Person, {}, date);
        for (const write of planned.writes) write(tx);
        return planned.id;
      });
    expect(await next()).toBe('PER-2026-00001');
    expect(await next()).toBe('PER-2026-00002');
  });

  it('builds ids from naming fields', async () => {
    const id = await project.db.runTransaction(
      async (tx) => (await planId(tx, project.db, CustomField, { targetDocType: 'Person', fieldname: ' shirtSize ' }, date)).id,
    );
    expect(id).toBe('Person.shirtSize');
  });

  it('rejects missing or unsafe naming values', async () => {
    const plan = (data: Record<string, unknown>) => project.db.runTransaction((tx) => planId(tx, project.db, Organization, data, date));
    await expect(plan({})).rejects.toMatchObject({ status: 422, details: { issues: [{ path: 'code' }] } });
    await expect(plan({ code: 'a/b' })).rejects.toMatchObject({ status: 422 });
  });

  it('generates Firestore ids for autoId DocTypes', async () => {
    const planned = await project.db.runTransaction((tx) => planId(tx, project.db, RoleAssignment, {}, date));
    expect(planned.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(planned.writes).toEqual([]);
  });
});

describe('loadOrgPath', () => {
  it('returns the stored orgPath and rejects unknown orgs', async () => {
    expect(await project.db.runTransaction((tx) => loadOrgPath(tx, deps, 'jci-kl'))).toEqual(KL);
    await expect(project.db.runTransaction((tx) => loadOrgPath(tx, deps, 'nowhere'))).rejects.toMatchObject({
      status: 422,
      details: { issues: [{ path: 'orgId' }] },
    });
    await expect(project.db.runTransaction((tx) => loadOrgPath(tx, deps, 'a/b'))).rejects.toMatchObject({ status: 422 });
  });
});

describe('loadCustomFields', () => {
  it('returns fields defined for the DocType at the org or its ancestors', async () => {
    const def = (fieldname: string, org: string, extra: Record<string, unknown> = {}) =>
      putDoc(project.db, 'customFields', `Person.${fieldname}`, {
        targetDocType: 'Person',
        fieldname,
        label: fieldname,
        fieldtype: 'Data',
        org,
        ...extra,
      });
    await def('shirtSize', 'jci-malaysia', { fieldtype: 'Select', options: 'S\nM\nL' });
    await def('pjOnly', 'jci-pj');
    await putDoc(project.db, 'customFields', 'Organization.motto', {
      targetDocType: 'Organization',
      fieldname: 'motto',
      label: 'Motto',
      fieldtype: 'Data',
      org: 'jci',
    });

    const forKl = await project.db.runTransaction((tx) => loadCustomFields(tx, deps, Person, KL));
    expect(forKl).toEqual([{ fieldname: 'shirtSize', label: 'shirtSize', fieldtype: 'Select', options: ['S', 'M', 'L'] }]);
    const all = await project.db.runTransaction((tx) => loadCustomFields(tx, deps, Person, null));
    expect(all.map((f) => f.fieldname)).toEqual(['pjOnly', 'shirtSize']);
    expect(await project.db.runTransaction((tx) => loadCustomFields(tx, deps, Person, []))).toEqual([]);
  });
});

describe('serializeDoc', () => {
  it('turns Timestamps into ISO strings at any depth', () => {
    const at = Timestamp.fromDate(NOW);
    expect(serializeDoc({ at, rows: [{ at }], n: 1, s: 'x', none: null })).toEqual({
      at: NOW.toISOString(),
      rows: [{ at: NOW.toISOString() }],
      n: 1,
      s: 'x',
      none: null,
    });
  });
});
