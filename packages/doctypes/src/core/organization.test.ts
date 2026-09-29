import { describe, expect, it } from 'vitest';
import { Organization, organizationController } from './organization';
import { orgDocs, SEED_ORGS } from './seed';
import { hookContext, KL_PATH } from './testContext';

const validate = async (doc: Record<string, unknown>, extra = {}) => organizationController.validate!(hookContext(Organization, doc, extra));

describe('Organization', () => {
  it('uses the code as its id and a read-only parent link', () => {
    expect(Organization.naming).toEqual({ kind: 'field', field: 'code' });
    expect(Organization.fields.find((f) => f.fieldname === 'parent')).toMatchObject({ link: 'Organization', readOnly: true });
  });

  it('accepts a local under a national area', async () => {
    await expect(validate({ code: 'jci-ipoh', title: 'JCI Ipoh', level: 'local', parent: 'jci-malaysia-central' })).resolves.toBeUndefined();
  });

  it('rejects levels that cannot sit under the parent', async () => {
    await expect(validate({ code: 'jci-x', title: 'X', level: 'national', parent: 'jci-malaysia-central' })).rejects.toMatchObject({
      field: 'level',
    });
    await expect(validate({ code: 'jci-x', title: 'X', level: 'area' })).rejects.toThrow(/needs a parent/);
  });

  it('rejects badly formed codes', async () => {
    await expect(validate({ code: 'JCI KL', title: 'X', level: 'local', parent: 'jci-malaysia-central' })).rejects.toMatchObject({
      field: 'code',
    });
  });

  it('keeps code and level fixed after creation', async () => {
    const before = { code: 'jci-kl', title: 'JCI Kuala Lumpur', level: 'local', parent: 'jci-malaysia-central' };
    const update = { isNew: false, before, orgPath: KL_PATH };
    await expect(validate({ ...before, code: 'jci-kl2' }, update)).rejects.toMatchObject({ field: 'code' });
    await expect(validate({ ...before, level: 'national_area' }, update)).rejects.toMatchObject({ field: 'level' });
    await expect(validate({ ...before, title: 'JCI KL' }, update)).resolves.toBeUndefined();
  });
});

describe('orgDocs', () => {
  it('builds each orgPath from its parent', () => {
    const docs = orgDocs(SEED_ORGS);
    expect(docs.map((d) => d.id)).toEqual(['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl']);
    expect(docs[4]).toEqual({
      id: 'jci-kl',
      code: 'jci-kl',
      title: 'JCI Kuala Lumpur',
      level: 'local',
      parent: 'jci-malaysia-central',
      orgId: 'jci-kl',
      orgPath: KL_PATH,
    });
  });

  it('requires parents to come first', () => {
    expect(() => orgDocs([{ code: 'a', title: 'A', level: 'local', parent: 'b' }])).toThrow(/before/);
  });
});
