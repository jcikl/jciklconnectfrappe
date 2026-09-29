import { describe, expect, it } from 'vitest';
import { defineDocType } from '../meta/defineDocType';
import type { UserContext } from './evaluate';
import { canReadSomewhere, docTypeLabel, filtersForDoc, listFilters, readableDocTypes, scopeOptions } from './listScope';

const title = [{ fieldname: 'title', label: 'Title', fieldtype: 'Data' as const }];
const org = defineDocType({
  name: 'Organization',
  module: 't',
  collection: 'organizations',
  fields: title,
  permissions: [
    { role: 'Member', read: true },
    { role: 'MembershipOfficer', read: true },
  ],
});
const note = defineDocType({
  name: 'PersonalNote',
  module: 't',
  collection: 'personalNotes',
  fields: title,
  permissions: [
    { role: 'Member', read: true, ifOwner: true },
    { role: 'MembershipOfficer', read: true },
  ],
});
const setting = defineDocType({
  name: 'Setting',
  module: 't',
  collection: 'settings',
  orgScoped: false,
  fields: title,
  permissions: [{ role: 'Member', read: true }],
});
const secret = defineDocType({ name: 'Secret', module: 't', collection: 'secrets', fields: title, permissions: [{ role: 'Treasurer', read: true }] });
const row = defineDocType({ name: 'Row', module: 't', isChild: true, fields: title });

const member: UserContext = { uid: 'u1', personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] };
const officer: UserContext = {
  uid: 'u2',
  personId: 'p2',
  grants: [
    { role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true },
    { role: 'Member', orgId: 'jci-kl', withDescendants: false },
  ],
};
const nobody: UserContext = { uid: 'u3', personId: null, grants: [] };

describe('canReadSomewhere and readableDocTypes', () => {
  it('needs a level-0 read row for a role the user holds', () => {
    expect(canReadSomewhere(org, member)).toBe(true);
    expect(canReadSomewhere(secret, member)).toBe(false);
    expect(canReadSomewhere(org, nobody)).toBe(false);
  });

  it('needs a personId for owner-only read rows', () => {
    expect(canReadSomewhere(note, member)).toBe(true);
    expect(canReadSomewhere(note, { ...member, personId: null })).toBe(false);
  });

  it('lists readable, non-child DocTypes in registry order', () => {
    expect(readableDocTypes([row, secret, org, setting, note], member).map((m) => m.name)).toEqual(['Organization', 'Setting', 'PersonalNote']);
  });
});

describe('scopeOptions', () => {
  it('offers each grant org once, widest first', () => {
    expect(scopeOptions(officer)).toEqual([
      { orgId: 'jci-malaysia', withDescendants: true },
      { orgId: 'jci-kl', withDescendants: false },
    ]);
    const both: UserContext = {
      ...member,
      grants: [...member.grants, { role: 'OrgAdmin', orgId: 'jci-kl', withDescendants: true }],
    };
    expect(scopeOptions(both)).toEqual([{ orgId: 'jci-kl', withDescendants: true }]);
    expect(scopeOptions(nobody)).toEqual([]);
  });
});

describe('listFilters', () => {
  it('filters exact grants by orgId and subtree grants by orgPath', () => {
    expect(listFilters(org, member, { orgId: 'jci-kl', withDescendants: false })).toEqual([{ field: 'orgId', op: '==', value: 'jci-kl' }]);
    expect(listFilters(org, officer, { orgId: 'jci-malaysia', withDescendants: true })).toEqual([
      { field: 'orgPath', op: 'array-contains', value: 'jci-malaysia' },
    ]);
  });

  it('uses the grant the user holds at that exact org for a read role', () => {
    // The officer's subtree grant is at jci-malaysia; at jci-kl only the Member grant applies.
    expect(listFilters(org, officer, { orgId: 'jci-kl', withDescendants: false })).toEqual([{ field: 'orgId', op: '==', value: 'jci-kl' }]);
    expect(listFilters(secret, officer, { orgId: 'jci-kl', withDescendants: false })).toBeNull();
    expect(listFilters(org, member, null)).toBeNull();
  });

  it('adds the owner filter when only an ifOwner row applies', () => {
    expect(listFilters(note, member, { orgId: 'jci-kl', withDescendants: false })).toEqual([
      { field: 'orgId', op: '==', value: 'jci-kl' },
      { field: 'ownerPersonId', op: '==', value: 'p1' },
    ]);
    expect(listFilters(note, { ...member, personId: null }, { orgId: 'jci-kl', withDescendants: false })).toBeNull();
    expect(listFilters(note, officer, { orgId: 'jci-malaysia', withDescendants: true })).toEqual([
      { field: 'orgPath', op: 'array-contains', value: 'jci-malaysia' },
    ]);
  });

  it('ignores the scope for global DocTypes', () => {
    expect(listFilters(setting, member, null)).toEqual([]);
    expect(listFilters(setting, nobody, null)).toBeNull();
  });
});

describe('docTypeLabel', () => {
  it('splits PascalCase names into words', () => {
    expect(docTypeLabel(org)).toBe('Organization');
    expect(docTypeLabel(note)).toBe('Personal Note');
  });
});

describe('filtersForDoc', () => {
  const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];
  const PJ = [...KL.slice(0, 4), 'jci-pj'];

  it('uses the scope option that covers the document', () => {
    expect(filtersForDoc(org, member, { orgId: 'jci-kl', orgPath: KL })).toEqual([{ field: 'orgId', op: '==', value: 'jci-kl' }]);
    expect(filtersForDoc(org, officer, { orgId: 'jci-pj', orgPath: PJ })).toEqual([
      { field: 'orgPath', op: 'array-contains', value: 'jci-malaysia' },
    ]);
    expect(filtersForDoc(org, member, { orgId: 'jci-pj', orgPath: PJ })).toBeNull();
  });

  it('keeps the owner filter and ignores the doc for global DocTypes', () => {
    expect(filtersForDoc(note, member, { orgId: 'jci-kl', orgPath: KL, ownerPersonId: 'p1' })).toEqual([
      { field: 'orgId', op: '==', value: 'jci-kl' },
      { field: 'ownerPersonId', op: '==', value: 'p1' },
    ]);
    expect(filtersForDoc(setting, member, {})).toEqual([]);
  });

  it('never returns a filter that excludes the document', () => {
    // Plain read for Member only; Treasurer reads its own. The merged jci-malaysia option is a subtree option,
    // but its plain filter comes from the exact Member grant: orgId == jci-malaysia, which misses a jci-kl doc.
    const ledger = defineDocType({
      name: 'Ledger',
      module: 't',
      collection: 'ledgers',
      fields: title,
      permissions: [
        { role: 'Member', read: true },
        { role: 'Treasurer', read: true, ifOwner: true },
      ],
    });
    const user: UserContext = {
      uid: 'u4',
      personId: 'p4',
      grants: [
        { role: 'Member', orgId: 'jci-malaysia', withDescendants: false },
        { role: 'Treasurer', orgId: 'jci-malaysia', withDescendants: true },
      ],
    };
    expect(listFilters(ledger, user, { orgId: 'jci-malaysia', withDescendants: true })).toEqual([
      { field: 'orgId', op: '==', value: 'jci-malaysia' },
    ]);
    expect(filtersForDoc(ledger, user, { orgId: 'jci-kl', orgPath: KL, ownerPersonId: 'p4' })).toBeNull();
    expect(filtersForDoc(ledger, user, { orgId: 'jci-malaysia', orgPath: KL.slice(0, 3), ownerPersonId: 'p9' })).toEqual([
      { field: 'orgId', op: '==', value: 'jci-malaysia' },
    ]);
  });

  it('prefers a later wide-read option over an earlier owner-only one for a doc the caller does not own', () => {
    const user: UserContext = {
      uid: 'u5',
      personId: 'p5',
      grants: [
        { role: 'Member', orgId: 'jci-kl', withDescendants: true },
        { role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true },
      ],
    };
    // jci-kl sorts first and gives only the owner filter for PersonalNote.
    expect(scopeOptions(user).map((o) => o.orgId)).toEqual(['jci-kl', 'jci-malaysia']);
    expect(filtersForDoc(note, user, { orgId: 'jci-kl', orgPath: KL, ownerPersonId: 'p9' })).toEqual([
      { field: 'orgPath', op: 'array-contains', value: 'jci-malaysia' },
    ]);
    // A doc the caller owns also gets the wide filter, which needs no owner match.
    expect(filtersForDoc(note, user, { orgId: 'jci-kl', orgPath: KL, ownerPersonId: 'p5' })).toEqual([
      { field: 'orgPath', op: 'array-contains', value: 'jci-malaysia' },
    ]);
  });

  it('keeps the owner filter for an owned doc when only it applies, and returns null for someone else\'s', () => {
    const doc = { orgId: 'jci-kl', orgPath: KL };
    expect(filtersForDoc(note, member, { ...doc, ownerPersonId: 'p1' })).toEqual([
      { field: 'orgId', op: '==', value: 'jci-kl' },
      { field: 'ownerPersonId', op: '==', value: 'p1' },
    ]);
    expect(filtersForDoc(note, member, { ...doc, ownerPersonId: 'p9' })).toBeNull();
  });
});
