import { describe, expect, it } from 'vitest';
import { defineDocType } from '../meta/defineDocType';
import { generateFirestoreRules } from './generateRules';

const title = [{ fieldname: 'title', label: 'Title', fieldtype: 'Data' as const }];
const org = defineDocType({
  name: 'Organization',
  module: 'core',
  collection: 'organizations',
  fields: title,
  permissions: [
    { role: 'SystemManager', read: true, write: true },
    { role: 'Member', read: true },
  ],
});
const person = defineDocType({
  name: 'Person',
  module: 'm',
  collection: 'persons',
  fields: title,
  permissions: [
    { role: 'Member', read: true, ifOwner: true },
    { role: 'Member', permlevel: 1, read: true },
    { role: 'MembershipOfficer', read: true },
  ],
});
const setting = defineDocType({
  name: 'Setting',
  module: 'core',
  collection: 'settings',
  orgScoped: false,
  trackChanges: false,
  fields: title,
  permissions: [{ role: 'Member', read: true }],
});
const secret = defineDocType({ name: 'Secret', module: 'core', collection: 'secrets', fields: title, permissions: [{ role: 'Treasurer', write: true }] });
const row = defineDocType({ name: 'Row', module: 'core', isChild: true, fields: title });
const rules = generateFirestoreRules([setting, person, org, row, secret]);

describe('generateFirestoreRules', () => {
  it('scopes org DocType reads by role and owner, from level-0 read rows only', () => {
    expect(rules).toContain(
      "match /persons/{id} {\n      allow read: if signedIn() && ((hasRole('Member', resource.data) && isOwner(resource.data)) || hasRole('MembershipOfficer', resource.data));\n      allow write: if false;",
    );
  });

  it('uses roles held anywhere for global DocTypes', () => {
    expect(rules).toContain("match /settings/{id} {\n      allow read: if signedIn() && (hasRoleAnywhere('Member'));");
  });

  it('denies reads when no role may read', () => {
    expect(rules).toContain('match /secrets/{id} {\n      allow read: if signedIn() && (false);');
  });

  it('lets users read only their own userAccess and skips child DocTypes', () => {
    expect(rules).toContain('match /userAccess/{uid} {\n      allow read: if signedIn() && request.auth.uid == uid;');
    // userAccess, organizations, persons, secrets, settings, versions.
    expect(rules.match(/match \/\w+\/\{(id|uid)\}/g)).toHaveLength(6);
  });

  it('guards versions per DocType, for tracked DocTypes only', () => {
    expect(rules).toContain(
      "(resource.data.doctype == 'Organization' && (hasRole('SystemManager', resource.data) || hasRole('Member', resource.data)))",
    );
    expect(rules).not.toContain("resource.data.doctype == 'Setting'");
  });

  it('never allows a client write', () => {
    expect(rules.match(/allow write: if false;/g)).toHaveLength(6);
    expect(rules).not.toMatch(/allow (write|create|update|delete): if (?!false)/);
  });

  it('is deterministic regardless of input order', () => {
    expect(generateFirestoreRules([org, secret, row, person, setting])).toBe(rules);
  });
});
