import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clearAuth, testProject } from './helpers';

const project = testProject('demo-jci-smoke');

beforeEach(() => project.clear());
afterAll(() => project.close());

describe('emulators', () => {
  it('store documents through the Admin SDK and drop undefined values', async () => {
    await project.db.collection('smoke').doc('a').set({ n: 1, skipped: undefined });
    expect((await project.db.collection('smoke').doc('a').get()).data()).toEqual({ n: 1 });
  });

  it('expose the Auth emulator', async () => {
    await expect(clearAuth(project.projectId)).resolves.toBeUndefined();
  });
});
