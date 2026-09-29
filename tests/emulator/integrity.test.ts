import { controllers } from '@jci/doctypes';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDoc, deleteDoc, updateDoc, type PipelineDeps } from '../../netlify/functions/_shared/pipeline';
import { NOW, seedOrgs, testRegistry, users } from './fixtures';
import { testProject } from './helpers';

const project = testProject('demo-jci-integrity');
const deps: PipelineDeps = { db: project.db, registry: testRegistry, controllers, now: () => NOW };
const create = (data: Record<string, unknown>) =>
  createDoc(deps, users.officer, 'Person', { orgId: 'jci-kl', data: { fullName: 'A', ...data } });

beforeEach(async () => {
  await project.clear();
  await seedOrgs(project.db);
});
afterAll(() => project.close());

describe('Link fields', () => {
  it('reject links to missing documents, including in child rows', async () => {
    await expect(create({ mentor: 'PER-2026-09999' })).rejects.toMatchObject({ status: 422, details: { issues: [{ path: 'mentor' }] } });
    await expect(create({ history: [{ year: 2025, org: 'nowhere' }] })).rejects.toMatchObject({
      status: 422,
      details: { issues: [{ path: 'history.0.org' }] },
    });
    const mentor = await create({ fullName: 'Mentor' });
    const r = await create({ mentor: mentor.id, history: [{ year: 2025, org: 'jci-kl' }] });
    expect(r.doc).toMatchObject({ mentor: mentor.id, history: [{ year: 2025, org: 'jci-kl' }] });
  });

  it('re-check only links that changed', async () => {
    const mentor = await create({ fullName: 'Mentor' });
    const r = await create({ mentor: mentor.id });
    await project.db.collection('persons').doc(mentor.id).delete();
    await expect(updateDoc(deps, users.officer, 'Person', r.id, { data: { phone: '2' } })).resolves.toMatchObject({
      changed: [['phone', null, '2']],
    });
    await expect(updateDoc(deps, users.officer, 'Person', r.id, { data: { mentor: 'PER-2026-09999' } })).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('unique fields', () => {
  it('reject a value another document already uses', async () => {
    await create({ email: 'a@jci.test' });
    await expect(create({ email: 'a@jci.test' })).rejects.toMatchObject({ status: 409, code: 'duplicate', details: { fields: ['email'] } });
  });

  it('free the old value when it changes or the document is deleted', async () => {
    const a = await create({ email: 'a@jci.test' });
    await updateDoc(deps, users.officer, 'Person', a.id, { data: { email: 'b@jci.test' } });
    const b = await create({ email: 'a@jci.test' });
    await deleteDoc(deps, users.officer, 'Person', a.id);
    await expect(create({ email: 'b@jci.test' })).resolves.toMatchObject({ doc: { email: 'b@jci.test' } });
    await expect(updateDoc(deps, users.officer, 'Person', b.id, { data: { email: 'a@jci.test', phone: '9' } })).resolves.toBeDefined();
  });

  it('ignore empty values', async () => {
    await create({ email: '' });
    await create({ email: '' });
    await create({});
    expect((await project.db.collection('uniqueKeys').get()).size).toBe(0);
  });
});
