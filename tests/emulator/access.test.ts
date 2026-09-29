import { controllers } from '@jci/doctypes';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadUserContext, rebuildUserAccess, syncUserAccessInTx } from '../../netlify/functions/_shared/access';
import { serverTxEffects } from '../../netlify/functions/_shared/effects';
import { createDoc, deleteDoc, updateDoc, type PipelineDeps } from '../../netlify/functions/_shared/pipeline';
import { NOW, seedOrgs, testRegistry, users } from './fixtures';
import { testProject } from './helpers';

const project = testProject('demo-jci-access');
const deps: PipelineDeps = { db: project.db, registry: testRegistry, controllers, txEffects: serverTxEffects, now: () => NOW };
const accessOf = async (uid: string) => (await project.db.collection('userAccess').doc(uid).get()).data();
const assign = (orgId: string, data: Record<string, unknown>, user = users.admin) => createDoc(deps, user, 'RoleAssignment', { orgId, data });

beforeEach(async () => {
  await project.clear();
  await seedOrgs(project.db);
});
afterAll(() => project.close());

describe('userAccess sync', () => {
  it('rebuilds userAccess when a role assignment is created, changed or deleted', async () => {
    const member = await assign('jci-kl', { uid: 'u-new', role: 'Member' });
    expect(await accessOf('u-new')).toMatchObject({
      uid: 'u-new',
      personId: null,
      grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }],
      scopes: { Member: { exact: ['jci-kl'], subtree: [] } },
    });

    await assign('jci-malaysia', { uid: 'u-new', role: 'OrgAdmin', withDescendants: true });
    expect((await accessOf('u-new'))?.scopes).toEqual({
      Member: { exact: ['jci-kl'], subtree: [] },
      OrgAdmin: { exact: [], subtree: ['jci-malaysia'] },
    });

    await updateDoc(deps, users.admin, 'RoleAssignment', member.id, { data: { uid: 'u-other' } });
    expect((await accessOf('u-new'))?.grants).toEqual([{ role: 'OrgAdmin', orgId: 'jci-malaysia', withDescendants: true }]);
    expect((await accessOf('u-other'))?.grants).toEqual([{ role: 'Member', orgId: 'jci-kl', withDescendants: false }]);

    await deleteDoc(deps, users.admin, 'RoleAssignment', member.id);
    expect((await accessOf('u-other'))?.grants).toEqual([]);
  });

  it('keeps an existing personId', async () => {
    await project.db.collection('userAccess').doc('u-p').set({ uid: 'u-p', personId: 'p9', grants: [], scopes: {} });
    await assign('jci-kl', { uid: 'u-p', role: 'Member' });
    expect((await accessOf('u-p'))?.personId).toBe('p9');
  });

  it('turns userAccess into the caller context', async () => {
    await assign('jci-kl', { uid: 'u-new', role: 'Member' });
    expect(await loadUserContext(project.db, 'u-new')).toEqual({
      uid: 'u-new',
      personId: null,
      grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }],
    });
    expect(await loadUserContext(project.db, 'nobody')).toEqual({ uid: 'nobody', personId: null, grants: [] });
    expect((await rebuildUserAccess({ db: project.db, registry: testRegistry }, 'nobody')).grants).toEqual([]);
  });

  it('rejects a uid that cannot name a userAccess document, storing nothing', async () => {
    await expect(assign('jci-kl', { uid: 'a/b', role: 'Member' })).rejects.toMatchObject({
      status: 422,
      details: { issues: [{ path: 'uid' }] },
    });
    expect((await project.db.collection('roleAssignments').get()).size).toBe(0);
  });

  it('commits userAccess atomically with the assignment', async () => {
    const member = await assign('jci-kl', { uid: 'u-new', role: 'Member' });
    // The real tx-effect runs, then another write in the same commit fails: nothing may land.
    await project.db.collection('userAccess').doc('taken').set({});
    const failAtCommit: PipelineDeps = {
      ...deps,
      txEffects: {
        RoleAssignment: async (tx, ctx) => [
          ...(await syncUserAccessInTx(tx, ctx)),
          (t) => t.create(project.db.collection('userAccess').doc('taken'), {}),
        ],
      },
    };
    await expect(deleteDoc(failAtCommit, users.admin, 'RoleAssignment', member.id)).rejects.toThrow();
    await expect(updateDoc(failAtCommit, users.admin, 'RoleAssignment', member.id, { data: { uid: 'u-other' } })).rejects.toThrow();
    expect((await accessOf('u-new'))?.grants).toEqual([{ role: 'Member', orgId: 'jci-kl', withDescendants: false }]);
    expect(await accessOf('u-other')).toBeUndefined();
    expect((await project.db.collection('roleAssignments').doc(member.id).get()).get('uid')).toBe('u-new');

    // The failed delete left the assignment in place, so retrying it works and revokes the grant.
    await deleteDoc(deps, users.admin, 'RoleAssignment', member.id);
    expect((await accessOf('u-new'))?.grants).toEqual([]);
  });

  it('repairs a stale userAccess when an assignment is saved again unchanged', async () => {
    const member = await assign('jci-kl', { uid: 'u-new', role: 'Member' });
    await project.db.collection('userAccess').doc('u-new').set({ uid: 'u-new', personId: null, grants: [], scopes: {} });
    const r = await updateDoc(deps, users.admin, 'RoleAssignment', member.id, { data: { uid: 'u-new' } });
    expect(r.changed).toEqual([]);
    expect((await accessOf('u-new'))?.grants).toEqual([{ role: 'Member', orgId: 'jci-kl', withDescendants: false }]);
  });

  it('stops org admins from escalating', async () => {
    await expect(assign('jci-pj', { uid: 'x', role: 'SystemManager' }, users.pjAdmin)).rejects.toMatchObject({
      status: 422,
      details: { issues: [{ path: 'role' }] },
    });
    await expect(assign('jci-pj', { uid: 'x', role: 'Member', withDescendants: true }, users.pjAdmin)).rejects.toMatchObject({
      status: 422,
      details: { issues: [{ path: 'withDescendants' }] },
    });
    await expect(assign('jci-kl', { uid: 'x', role: 'Member' }, users.pjAdmin)).rejects.toMatchObject({ status: 403 });
    await assign('jci-pj', { uid: 'x', role: 'Member' }, users.pjAdmin);
    expect((await accessOf('x'))?.grants).toEqual([{ role: 'Member', orgId: 'jci-pj', withDescendants: false }]);
  });
});
