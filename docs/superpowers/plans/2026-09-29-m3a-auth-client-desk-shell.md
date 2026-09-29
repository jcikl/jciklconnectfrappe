# M3a Implementation Plan (sign-in, client data layer, Desk shell)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign in to the Expo app on web, iOS and Android against the Firebase emulators. Land in a Desk with a sidebar that lists the DocTypes the user may read and an organisation-scope switcher. Open a read-only list of any DocType, fetched straight from Firestore with queries the generated rules allow.

**Architecture:**
- **`@jci/core` gains `listScope.ts`.** It holds pure functions that decide:
  - which DocTypes a user can read somewhere;
  - which orgs the Desk can be scoped to;
  - which Firestore filters make a list query that the generated rules can prove safe.
- **A new `@jci/client` package owns the Firebase JS SDK**, split into two entry points:
  - `@jci/client` (no React): the client init, a typed `/api/resource` client, sign-in helpers, and tiny subscribable stores for auth state, userAccess, lists and single documents.
  - `@jci/client/react`: `ClientProvider` plus hooks built on `useSyncExternalStore`.
- **`@jci/ui` gets new building blocks:** `Spinner`, `ErrorState`, `ListItem` and `Page`, plus the `AuthShell` and `DeskShell` layouts.
- **`apps/app` composes them** into `/login`, `/desk` and `/desk/[doctype]`.
- Stores and query filters are tested against the emulators, with the real rules. UI pieces are tested with jest-expo. The full flow is checked by hand on web and on the Android emulator.

**Tech Stack:**
- Everything from M1 and M2, plus the Firebase JS SDK 12 (`firebase/app`, `firebase/auth`, `firebase/firestore`).
- `@react-native-async-storage/async-storage` 2.2.0 (the Expo SDK 57 version), used for auth persistence on native.
- Expo Router 57: groups, `Redirect`, `Slot`, `usePathname`, `useLocalSearchParams`.

Spec: `docs/superpowers/specs/2026-09-29-jci-platform-core-member-crm-design.md`
Previous plans: `docs/superpowers/plans/2026-09-29-m1-foundation.md`, `docs/superpowers/plans/2026-09-29-m2-api-rules-audit.md`
Carry-overs: `docs/superpowers/plans/m2-followups.md` ("Needed by M3" and the backlog).

## Where M3a sits
M3 is split into three plans, each shippable on its own:
- **M3a (this plan):** sign-in, the client data layer, the Desk shell, and a read-only list.
- **M3b:** `@jci/ui` `fields/` (one FieldControl per field type), `DocForm` (create and edit through `/api/resource`, gated by `resolveDocAccess`, with child tables and a LinkPicker), and the version Timeline.
- **M3c:** `DocList` (a TanStack table on web, a simplified list on native), FilterBar, search, sorting, paging and CSV export.

## Decisions this plan makes (read before starting)
1. **Sign-in methods.**
   - Email and password work on every platform.
   - Google sign-in is web only for now (`signInWithPopup`). On a phone, Google sign-in needs an EAS dev build, which Expo Go cannot provide. It is recorded in `m3-followups.md`.
   - There is no sign-up screen. Accounts come from the migration (M7) or from administrators.
   - Password reset is also deferred.
2. **Everything targets the emulators.**
   - The app reads `EXPO_PUBLIC_*` variables, with defaults for the `demo-jci` project.
   - Emulator host defaults: `localhost` on web and iOS; `10.0.2.2` on the Android emulator, which is how it reaches the PC.
   - A real Firebase project comes with deployment.
3. **List queries follow the rules exactly.**
   - For a subtree grant at the scope org, filter `orgPath array-contains <org>`.
   - For an exact grant, filter `orgId == <org>`.
   - For `ifOwner` read rows, also filter `ownerPersonId == <personId>`.
   - Global DocTypes need no org filter.
   - The scope options are the orgs in the user's own grants. Task 1 proves every generated filter against the real generated rules.
4. **Reads use snapshot listeners** (`onSnapshot`), so the Desk updates live. The list page caps at 50 documents with no ordering. Ordering, paging and search are M3c.
5. **The web export changes from `"static"` to `"single"`.**
   - The Desk is behind sign-in, so pre-rendered HTML adds nothing.
   - Static rendering would also run the Firebase browser SDK in Node at build time.
   - `netlify.toml` gets an SPA fallback redirect. Function routes (`/api/resource/...`) keep priority, and Task 8 verifies this.
6. **`@jci/client` is not app code.**
   - It has no UI, so the `@jci/ui`-only lint rule does not apply to it.
   - Screens import hooks from `@jci/client/react` and never touch the Firebase SDK directly.
7. **Emulator test files run one at a time** (`fileParallelism: false`).
   - The client tests must use the Auth emulator's default project (`demo-jci`), which `resource.test.ts` also clears.
   - Running files sequentially removes the race. The emulator suite stays under a minute.

## Global Constraints
- Repo root: `C:\Users\User\Documents\Cursor projects\Frappe`. All paths below are relative to it.
- Commands use Git Bash syntax, run from the repo root unless a step says otherwise.
- Work on branch `m3-desk`, which the controller creates from `m2-api-rules-audit`. Do not switch branches.
- **JDK 21 is not on PATH in this environment.** Start every Bash command that runs `firebase`, `npm run emulators`, `npm run test:emulator` or `npm run seed:dev` with:
  `export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot"; export PATH="$JAVA_HOME/bin:$PATH";`
- **Hard rule from M1, unchanged:** app code (`apps/app`, `packages/doctypes`) builds its UI only from `@jci/ui`.
  - React Native view primitives, NativeWind and `className`/`style` props may be used only inside `packages/ui`.
  - App code may import non-visual `react-native` APIs (`Platform`, `useWindowDimensions`, and so on) and `expo-router`.
- No hex colour literals anywhere except `packages/ui/src/tokens/tokens.json`.
- `@jci/ui` components:
  - take semantic props, never `className` or `style`;
  - use Tailwind class strings that are literal (lookup maps);
  - have touch targets of at least 44 px (`min-h-11`);
  - have `accessibilityRole` and `accessibilityLabel` where interactive;
  - have web focus rings;
  - get a gallery entry.
- Colours are semantic token pairs, e.g. `bg-surface dark:bg-surface-dark`.
- Screens use a 16 px side gutter (`px-4`).
- Roles: `SystemManager, OrgAdmin, MembershipOfficer, Treasurer, BoardMember, Member, Guest`.
- `orgPath` lists ancestor ids and ends with the org's own id. `orgId` is the last element.
- Emulator ports: Firestore `8080`, Auth `9099`. The API (`npm run dev:api`) runs on `8888`, and Expo web on `8081`.
- Dev accounts exist only in the Auth emulator, with password `jci-dev-password`:
  - `admin@jci.test` (SystemManager at `jci`, subtree)
  - `member@jci.test` (Member at `jci-kl`, exact). Task 7 adds this account.
- Commit after every task. End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never use another model name.

## File Structure (end state of M3a)
```
packages/core/src/perm/listScope.ts (+ .test.ts)   canReadSomewhere, readableDocTypes, scopeOptions, listFilters, docTypeLabel
packages/client/
  package.json  tsconfig.json
  src/index.ts                 non-React entry
  src/config.ts                ClientConfig
  src/store.ts (+ .test.ts)    Store<T>, createStore, constantStore
  src/api.ts (+ .test.ts)      createApiClient, ApiRequestError
  src/errors.ts (+ .test.ts)   authErrorMessage
  src/firebase.ts              initClient, FirebaseClient
  src/persistence.ts  src/persistence.native.ts   auth persistence per platform
  src/auth.ts                  signInWithEmail, signInWithGoogle, signOutUser, currentIdToken
  src/stores.ts                createAuthStore, createAccessStore, createDocsStore, createDocStore
  src/react.tsx                ClientProvider, useClient, useStore, useAuthState, useAccess, useDocs, useDocument
packages/ui/src/
  components/{Spinner,ErrorState,ListItem}.tsx   primitives/Page.tsx
  layouts/{AuthShell,DeskShell}.tsx
  components/__tests__/feedback.test.tsx   layouts/__tests__/layouts.test.tsx
apps/app/
  app/_layout.tsx  app/index.tsx
  app/(auth)/_layout.tsx  app/(auth)/login.tsx
  app/(desk)/_layout.tsx  app/(desk)/desk/index.tsx  app/(desk)/desk/[doctype]/index.tsx
  app/(dev)/ui-gallery.tsx  app/(dev)/gallery-auth-shell.tsx  app/(dev)/gallery-desk-shell.tsx
  src/config.ts  src/client.ts
  src/desk/{DeskContext,DeskFrame,ScopePicker}.tsx
tests/emulator/listScope.test.ts  tests/emulator/client.test.ts
scripts/seed-dev.mts           + member@jci.test
netlify.toml                   + SPA fallback
docs/superpowers/plans/m3-followups.md
```

---

### Task 1: List scope rules in `@jci/core`, proven against the generated Firestore rules

**Files:**
- Create: `packages/core/src/perm/listScope.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/perm/listScope.test.ts`, `tests/emulator/listScope.test.ts`

**Interfaces:**
- Consumes:
  - `DocTypeMeta`, `DocPerm`, `RoleName` (`meta/types.ts`)
  - `UserContext` (`perm/evaluate.ts`)
  - `generateFirestoreRules`, `buildUserAccess`, `defineDocType`
  - `DOCTYPES` and `orgDocs` from `@jci/doctypes`
  - `TEST_ORGS`, `KL`, `PJ` (`tests/emulator/fixtures.ts`)
  - `requireEmulators` (`tests/emulator/helpers.ts`)
- Produces:

```ts
interface ScopeOption { orgId: string; withDescendants: boolean }
type ListFilter =
  | { field: 'orgId' | 'ownerPersonId'; op: '=='; value: string }
  | { field: 'orgPath'; op: 'array-contains'; value: string };
function canReadSomewhere(meta: DocTypeMeta, user: UserContext): boolean
function readableDocTypes(metas: readonly DocTypeMeta[], user: UserContext): DocTypeMeta[]   // non-child, readable somewhere, in input order
function scopeOptions(user: UserContext): ScopeOption[]   // one per grant org; subtree options first, then by orgId
function listFilters(meta: DocTypeMeta, user: UserContext, scope: ScopeOption | null): ListFilter[] | null
function docTypeLabel(meta: DocTypeMeta): string          // 'RoleAssignment' → 'Role Assignment'
```

- [ ] **Step 1: Write the failing unit tests**

Create `packages/core/src/perm/listScope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defineDocType } from '../meta/defineDocType';
import type { UserContext } from './evaluate';
import { canReadSomewhere, docTypeLabel, listFilters, readableDocTypes, scopeOptions } from './listScope';

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/src/perm/listScope.test.ts`
Expected: FAIL with `Failed to resolve import "./listScope"`.

- [ ] **Step 3: Implement the module**

Create `packages/core/src/perm/listScope.ts`:

```ts
import type { DocPerm, DocTypeMeta, RoleName } from '../meta/types';
import type { UserContext } from './evaluate';

/** An org the Desk can be scoped to: one of the caller's grant orgs. */
export interface ScopeOption {
  orgId: string;
  /** true when some grant at this org covers its whole subtree. */
  withDescendants: boolean;
}

/** A Firestore filter the client adds to a list query. Only shapes the generated rules can prove safe. */
export type ListFilter =
  | { field: 'orgId' | 'ownerPersonId'; op: '=='; value: string }
  | { field: 'orgPath'; op: 'array-contains'; value: string };

function readRows(meta: DocTypeMeta): DocPerm[] {
  return meta.permissions.filter((p) => (p.permlevel ?? 0) === 0 && p.read === true);
}

export function canReadSomewhere(meta: DocTypeMeta, user: UserContext): boolean {
  const held = new Set(user.grants.map((g) => g.role));
  return readRows(meta).some((p) => held.has(p.role) && (!p.ifOwner || user.personId !== null));
}

export function readableDocTypes(metas: readonly DocTypeMeta[], user: UserContext): DocTypeMeta[] {
  return metas.filter((m) => !m.isChild && canReadSomewhere(m, user));
}

export function scopeOptions(user: UserContext): ScopeOption[] {
  const byOrg = new Map<string, boolean>();
  for (const g of user.grants) byOrg.set(g.orgId, (byOrg.get(g.orgId) ?? false) || g.withDescendants);
  return [...byOrg]
    .map(([orgId, withDescendants]) => ({ orgId, withDescendants }))
    .sort((a, b) => Number(b.withDescendants) - Number(a.withDescendants) || (a.orgId < b.orgId ? -1 : a.orgId > b.orgId ? 1 : 0));
}

/**
 * Filters for listing `meta` inside `scope`. The generated rules allow exactly these shapes:
 * a subtree grant at the scope org gives `orgPath array-contains`, an exact grant gives `orgId ==`,
 * and an ifOwner row adds `ownerPersonId ==`. Returns null when no read row applies there.
 * Global DocTypes ignore the scope.
 */
export function listFilters(meta: DocTypeMeta, user: UserContext, scope: ScopeOption | null): ListFilter[] | null {
  const rows = readRows(meta);
  const plain = new Set<RoleName>(rows.filter((p) => !p.ifOwner).map((p) => p.role));
  const owner = new Set<RoleName>(rows.filter((p) => p.ifOwner).map((p) => p.role));
  const ownerFilter: ListFilter | null = user.personId === null ? null : { field: 'ownerPersonId', op: '==', value: user.personId };

  if (!meta.orgScoped) {
    if (user.grants.some((g) => plain.has(g.role))) return [];
    if (ownerFilter && user.grants.some((g) => owner.has(g.role))) return [ownerFilter];
    return null;
  }
  if (!scope) return null;

  const here = user.grants.filter((g) => g.orgId === scope.orgId);
  const orgFilter = (roles: ReadonlySet<RoleName>): ListFilter | null => {
    if (here.some((g) => roles.has(g.role) && g.withDescendants)) return { field: 'orgPath', op: 'array-contains', value: scope.orgId };
    if (here.some((g) => roles.has(g.role))) return { field: 'orgId', op: '==', value: scope.orgId };
    return null;
  };

  const wide = orgFilter(plain);
  if (wide) return [wide];
  const own = orgFilter(owner);
  return own && ownerFilter ? [own, ownerFilter] : null;
}

/** A readable label for a DocType name: 'RoleAssignment' → 'Role Assignment'. */
export function docTypeLabel(meta: DocTypeMeta): string {
  return meta.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}
```

In `packages/core/src/index.ts`, add after `export * from './perm/access';`:

```ts
export * from './perm/listScope';
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npx vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Prove the filters against the generated rules**

Create `tests/emulator/listScope.test.ts`. The rules come from `generateFirestoreRules` over the real core DocTypes plus a test-only `PersonalNote` DocType with an `ifOwner` read row. That way the owner filter is proven too.

```ts
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  buildUserAccess,
  defineDocType,
  generateFirestoreRules,
  listFilters,
  scopeOptions,
  userContextFromAccess,
  type DocTypeMeta,
  type ListFilter,
  type RoleGrant,
} from '@jci/core';
import { CustomField, DOCTYPES, Organization, orgDocs, RoleAssignment } from '@jci/doctypes';
import type firebase from 'firebase/compat/app';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { KL, PJ, TEST_ORGS } from './fixtures';
import { requireEmulators } from './helpers';

const PersonalNote = defineDocType({
  name: 'PersonalNote',
  module: 'test',
  collection: 'personalNotes',
  fields: [{ fieldname: 'title', label: 'Title', fieldtype: 'Data' }],
  permissions: [
    { role: 'Member', read: true, ifOwner: true },
    { role: 'MembershipOfficer', read: true },
  ],
});

const grant = (role: RoleGrant['role'], orgId: string, withDescendants = false): RoleGrant => ({ role, orgId, withDescendants });
const ACCESS = {
  'member-kl': buildUserAccess('member-kl', 'p-kl', [grant('Member', 'jci-kl')]),
  'officer-my': buildUserAccess('officer-my', 'p-my', [grant('MembershipOfficer', 'jci-malaysia', true)]),
  'admin-pj': buildUserAccess('admin-pj', null, [grant('OrgAdmin', 'jci-pj')]),
};
type Uid = keyof typeof ACCESS;

let env: RulesTestEnvironment;

async function list(uid: Uid, meta: DocTypeMeta, filters: readonly ListFilter[]): Promise<string[]> {
  let q: firebase.firestore.Query = env.authenticatedContext(uid).firestore().collection(meta.collection);
  for (const f of filters) q = q.where(f.field, f.op, f.value);
  const snap = await assertSucceeds(q.get());
  return snap.docs.map((d) => d.id).sort();
}

/** Filters for the user's first (widest) scope option. */
function filtersFor(uid: Uid, meta: DocTypeMeta): ListFilter[] | null {
  const user = userContextFromAccess(ACCESS[uid], uid);
  return listFilters(meta, user, scopeOptions(user)[0] ?? null);
}

beforeAll(async () => {
  requireEmulators();
  env = await initializeTestEnvironment({
    projectId: 'demo-jci-scope',
    firestore: { rules: generateFirestoreRules([...DOCTYPES, PersonalNote]) },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const inOrg = (orgPath: string[], ownerPersonId: string | null = null) => ({ orgId: orgPath[orgPath.length - 1], orgPath, ownerPersonId });
    for (const o of orgDocs(TEST_ORGS)) await db.collection('organizations').doc(String(o.id)).set(o);
    for (const [uid, access] of Object.entries(ACCESS)) await db.collection('userAccess').doc(uid).set(access);
    await db.collection('roleAssignments').doc('ra-kl').set({ uid: 'member-kl', role: 'Member', ...inOrg(KL) });
    await db.collection('roleAssignments').doc('ra-pj').set({ uid: 'admin-pj', role: 'OrgAdmin', ...inOrg(PJ) });
    await db.collection('customFields').doc('Organization.motto').set({ targetDocType: 'Organization', fieldname: 'motto', org: 'jci' });
    await db.collection('personalNotes').doc('n-kl-mine').set({ title: 'Mine', ...inOrg(KL, 'p-kl') });
    await db.collection('personalNotes').doc('n-kl-other').set({ title: 'Other', ...inOrg(KL, 'p-other') });
    await db.collection('personalNotes').doc('n-pj-mine').set({ title: 'Mine in PJ', ...inOrg(PJ, 'p-kl') });
  });
});

afterAll(() => env?.cleanup());

describe('list filters satisfy the generated rules', () => {
  it('lets a member list only their own local', async () => {
    const filters = filtersFor('member-kl', Organization);
    expect(filters).toEqual([{ field: 'orgId', op: '==', value: 'jci-kl' }]);
    expect(await list('member-kl', Organization, filters!)).toEqual(['jci-kl']);
  });

  it('lets a national officer list the whole national subtree', async () => {
    const filters = filtersFor('officer-my', Organization);
    expect(await list('officer-my', Organization, filters!)).toEqual(['jci-kl', 'jci-malaysia', 'jci-malaysia-central', 'jci-pj']);
  });

  it('lets an org admin list role assignments at their org, and hides them from members', async () => {
    expect(await list('admin-pj', RoleAssignment, filtersFor('admin-pj', RoleAssignment)!)).toEqual(['ra-pj']);
    expect(filtersFor('member-kl', RoleAssignment)).toBeNull();
  });

  it('lists global DocTypes without an org filter', async () => {
    expect(filtersFor('member-kl', CustomField)).toEqual([]);
    expect(await list('member-kl', CustomField, [])).toEqual(['Organization.motto']);
  });

  it('proves owner-only reads with the owner filter', async () => {
    const filters = filtersFor('member-kl', PersonalNote);
    expect(filters).toEqual([
      { field: 'orgId', op: '==', value: 'jci-kl' },
      { field: 'ownerPersonId', op: '==', value: 'p-kl' },
    ]);
    expect(await list('member-kl', PersonalNote, filters!)).toEqual(['n-kl-mine']);
    expect(await list('officer-my', PersonalNote, filtersFor('officer-my', PersonalNote)!)).toEqual(['n-kl-mine', 'n-kl-other', 'n-pj-mine']);
  });

  it('shows the rules reject a list without the owner filter', async () => {
    const q = env.authenticatedContext('member-kl').firestore().collection('personalNotes').where('orgId', '==', 'jci-kl');
    await assertFails(q.get());
  });
});
```

- [ ] **Step 6: Run the emulator tests**

Run (Java prefix first): `npm run test:emulator`
Expected: PASS for every file, including the 6 new `listScope` tests.

**If a `list filters satisfy the generated rules` test fails with a permission error, stop and report it.** The failing filter shape and the error text are what the user needs to see. Do not change the rules generator or loosen a filter to make it pass.

- [ ] **Step 7: Run the checks and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add packages/core/src/perm/listScope.ts packages/core/src/perm/listScope.test.ts packages/core/src/index.ts tests/emulator/listScope.test.ts
git commit -m "feat(core): list scopes and rule-safe list filters for the Desk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `@jci/client` package: stores, API client, auth error messages

**Files:**
- Create: `packages/client/package.json`, `packages/client/tsconfig.json`
- Create: `packages/client/src/index.ts`, `src/config.ts`, `src/store.ts`, `src/api.ts`, `src/errors.ts`
- Modify: root `package.json` (`typecheck`), `vitest.config.ts` (unit `include`)
- Test: `packages/client/src/store.test.ts`, `src/api.test.ts`, `src/errors.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:

```ts
interface ClientConfig {
  projectId: string; apiKey: string; authDomain?: string; appId?: string;
  /** Host of the local emulators (no scheme or port), e.g. 'localhost' or '10.0.2.2'. Unset in production. */
  emulatorHost?: string;
  /** Base URL of the API, e.g. 'http://localhost:8888'. */
  apiBaseUrl: string;
  /** Firebase app name; tests use it to run several clients. Default '[DEFAULT]'. */
  appName?: string;
}
interface Store<T> { getSnapshot(): T; subscribe(listener: () => void): () => void }
function createStore<T>(initial: T, start: (set: (next: T) => void) => () => void): Store<T>   // starts on first subscriber, stops after the last
function constantStore<T>(value: T): Store<T>
class ApiRequestError extends Error { readonly status: number; readonly code: string; readonly details?: unknown }
interface ApiClient {
  create(doctype: string, input: { orgId?: string; data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  update(doctype: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  remove(doctype: string, id: string): Promise<void>;
}
function createApiClient(opts: { baseUrl: string; getIdToken: () => Promise<string | null>; fetch?: typeof fetch }): ApiClient
function authErrorMessage(err: unknown): string | null   // null when the user cancelled
```

Error behaviour of `createApiClient`:
- A missing token throws `ApiRequestError(401, 'unauthenticated')` without calling fetch.
- A network failure throws `ApiRequestError(0, 'network')`.
- An error response throws with the server's `error.code`, `error.message` and `error.details`.

- [ ] **Step 1: Create the package**

Create `packages/client/package.json`:

```json
{
  "name": "@jci/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./react": "./src/react.tsx"
  },
  "dependencies": {
    "@jci/core": "*"
  },
  "peerDependencies": {
    "react": "*"
  }
}
```

Create `packages/client/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

Create `packages/client/src/config.ts`:

```ts
export interface ClientConfig {
  projectId: string;
  apiKey: string;
  authDomain?: string;
  appId?: string;
  /** Host of the local emulators (no scheme or port), e.g. 'localhost' or '10.0.2.2'. Unset in production. */
  emulatorHost?: string;
  /** Base URL of the API, e.g. 'http://localhost:8888'. */
  apiBaseUrl: string;
  /** Firebase app name; tests use it to run several clients. Default '[DEFAULT]'. */
  appName?: string;
}
```

Run `npm install` to link the workspace.

In the root `package.json`:
- Change `typecheck` to add `tsc -p packages/client --noEmit` after the doctypes step:

```json
"typecheck": "tsc -p packages/core --noEmit && tsc -p packages/doctypes --noEmit && tsc -p packages/client --noEmit && tsc -p packages/ui --noEmit && tsc -p apps/app --noEmit && tsc -p tsconfig.server.json --noEmit",
```

In `vitest.config.ts`, add `'packages/client/src/**/*.test.ts'` to the `unit` project's `include` list.

- [ ] **Step 2: Write the failing tests**

Create `packages/client/src/store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { constantStore, createStore } from './store';

describe('createStore', () => {
  it('starts on the first subscriber and stops after the last', () => {
    const stop = vi.fn();
    const start = vi.fn(() => stop);
    const store = createStore(0, start);
    expect(start).not.toHaveBeenCalled();
    const a = store.subscribe(() => {});
    const b = store.subscribe(() => {});
    expect(start).toHaveBeenCalledTimes(1);
    a();
    expect(stop).not.toHaveBeenCalled();
    b();
    expect(stop).toHaveBeenCalledTimes(1);
    store.subscribe(() => {});
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('notifies listeners and keeps the snapshot stable between updates', () => {
    let set: (n: number) => void = () => {};
    const store = createStore(1, (s) => {
      set = s;
      return () => {};
    });
    const listener = vi.fn();
    store.subscribe(listener);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    set(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(2);
  });

  it('lets a start function publish synchronously', () => {
    const store = createStore('loading', (set) => {
      set('ready');
      return () => {};
    });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.getSnapshot()).toBe('ready');
  });
});

describe('constantStore', () => {
  it('always returns the same value', () => {
    const store = constantStore({ status: 'loading' });
    const unsubscribe = store.subscribe(() => {});
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    unsubscribe();
  });
});
```

Create `packages/client/src/api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createApiClient } from './api';

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createApiClient', () => {
  it('sends an authenticated create and returns the saved document', async () => {
    const { fetch, calls } = fakeFetch(() => json(201, { data: { id: 'jci-pj', title: 'JCI PJ' } }));
    const api = createApiClient({ baseUrl: 'http://localhost:8888/', getIdToken: async () => 'tok', fetch });
    const doc = await api.create('Organization', { orgId: 'jci-malaysia-central', data: { code: 'jci-pj' } });
    expect(doc).toEqual({ id: 'jci-pj', title: 'JCI PJ' });
    expect(calls[0]!.url).toBe('http://localhost:8888/api/resource/Organization');
    expect(calls[0]!.init.method).toBe('POST');
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe('Bearer tok');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ orgId: 'jci-malaysia-central', data: { code: 'jci-pj' } });
  });

  it('encodes ids and handles update and delete', async () => {
    const { fetch, calls } = fakeFetch((c) => (c.init.method === 'DELETE' ? new Response(null, { status: 204 }) : json(200, { data: { id: 'a b' } })));
    const api = createApiClient({ baseUrl: 'http://api', getIdToken: async () => 'tok', fetch });
    expect(await api.update('Person', 'a b', { phone: '1' })).toEqual({ id: 'a b' });
    await api.remove('Person', 'a b');
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ['PUT', 'http://api/api/resource/Person/a%20b'],
      ['DELETE', 'http://api/api/resource/Person/a%20b'],
    ]);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ data: { phone: '1' } });
  });

  it('turns API error responses into ApiRequestError', async () => {
    const { fetch } = fakeFetch(() =>
      json(403, { error: { code: 'field_not_writable', message: 'You cannot change some of these fields', details: { fields: ['level'] } } }),
    );
    const api = createApiClient({ baseUrl: 'http://api', getIdToken: async () => 'tok', fetch });
    const err = await api.update('Organization', 'jci-kl', { level: 'national' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 403, code: 'field_not_writable', message: 'You cannot change some of these fields', details: { fields: ['level'] } });
  });

  it('reports non-JSON errors, network failures and missing tokens', async () => {
    const bad = createApiClient({ baseUrl: 'http://api', getIdToken: async () => 'tok', fetch: fakeFetch(() => new Response('oops', { status: 502 })).fetch });
    await expect(bad.remove('Person', 'x')).rejects.toMatchObject({ status: 502, code: 'http_error' });

    const offline = createApiClient({
      baseUrl: 'http://api',
      getIdToken: async () => 'tok',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    });
    await expect(offline.remove('Person', 'x')).rejects.toMatchObject({ status: 0, code: 'network' });

    const { fetch, calls } = fakeFetch(() => json(200, {}));
    const signedOut = createApiClient({ baseUrl: 'http://api', getIdToken: async () => null, fetch });
    await expect(signedOut.remove('Person', 'x')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(calls).toHaveLength(0);
  });
});
```

Create `packages/client/src/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './errors';

describe('authErrorMessage', () => {
  it('maps Firebase Auth codes to plain messages', () => {
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toBe('Email or password is incorrect.');
    expect(authErrorMessage({ code: 'auth/wrong-password' })).toBe('Email or password is incorrect.');
    expect(authErrorMessage({ code: 'auth/user-not-found' })).toBe('Email or password is incorrect.');
    expect(authErrorMessage({ code: 'auth/invalid-email' })).toBe('Enter a valid email address.');
    expect(authErrorMessage({ code: 'auth/user-disabled' })).toBe('This account has been disabled. Contact an administrator.');
    expect(authErrorMessage({ code: 'auth/too-many-requests' })).toBe('Too many attempts. Wait a moment and try again.');
    expect(authErrorMessage({ code: 'auth/network-request-failed' })).toBe('Could not reach the sign-in service. Check your connection.');
  });

  it('stays quiet when the user closes the Google popup', () => {
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toBeNull();
    expect(authErrorMessage({ code: 'auth/cancelled-popup-request' })).toBeNull();
  });

  it('falls back to a generic message', () => {
    expect(authErrorMessage({ code: 'auth/something-new' })).toBe('Sign-in failed. Please try again.');
    expect(authErrorMessage(new Error('boom'))).toBe('Sign-in failed. Please try again.');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/client`
Expected: FAIL with unresolved imports of `./store`, `./api` and `./errors`.

- [ ] **Step 4: Implement the modules**

Create `packages/client/src/store.ts`:

```ts
/** A value that changes over time; the shape React's useSyncExternalStore expects. */
export interface Store<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

/**
 * A store that runs `start` when it gets its first subscriber and runs the returned stop function
 * when the last one leaves. `start` receives `set` to publish new values (it may call it synchronously).
 */
export function createStore<T>(initial: T, start: (set: (next: T) => void) => () => void): Store<T> {
  let value = initial;
  let stop: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const set = (next: T) => {
    value = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      if (!stop) stop = start(set);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stop) {
          const running = stop;
          stop = null;
          running();
        }
      };
    },
  };
}

export function constantStore<T>(value: T): Store<T> {
  return { getSnapshot: () => value, subscribe: () => () => {} };
}
```

Create `packages/client/src/api.ts`:

```ts
/** An error from /api/resource, carrying the server's `{ error: { code, message, details } }`. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiClient {
  create(doctype: string, input: { orgId?: string; data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  update(doctype: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  remove(doctype: string, id: string): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  getIdToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? fetch;
  const path = (doctype: string, id?: string) =>
    `/api/resource/${encodeURIComponent(doctype)}${id === undefined ? '' : `/${encodeURIComponent(id)}`}`;

  async function send(method: 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<unknown> {
    const token = await opts.getIdToken();
    if (!token) throw new ApiRequestError(401, 'unauthenticated', 'Sign in first');
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await doFetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiRequestError(0, 'network', 'Could not reach the server. Check your connection and try again.');
    }
    if (res.status === 204) return null;
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
      throw new ApiRequestError(
        res.status,
        typeof error.code === 'string' ? error.code : 'http_error',
        typeof error.message === 'string' ? error.message : `Request failed (${res.status})`,
        error.details,
      );
    }
    return payload;
  }

  const dataOf = (payload: unknown): Record<string, unknown> =>
    isRecord(payload) && isRecord(payload.data) ? payload.data : {};

  return {
    create: async (doctype, input) => dataOf(await send('POST', path(doctype), input)),
    update: async (doctype, id, data) => dataOf(await send('PUT', path(doctype, id), { data })),
    remove: async (doctype, id) => {
      await send('DELETE', path(doctype, id));
    },
  };
}
```

Create `packages/client/src/errors.ts`:

```ts
const MESSAGES: Record<string, string | null> = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact an administrator.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection.',
  'auth/popup-closed-by-user': null,
  'auth/cancelled-popup-request': null,
};

/** A message to show for a failed sign-in, or null when the user simply cancelled. */
export function authErrorMessage(err: unknown): string | null {
  const code = err !== null && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  return code in MESSAGES ? MESSAGES[code]! : 'Sign-in failed. Please try again.';
}
```

`MESSAGES[code]!` is safe because `code in MESSAGES`. The `!` only drops `undefined` from the type; a `null` value still passes through.

Create `packages/client/src/index.ts`:

```ts
export * from './api';
export * from './config';
export * from './errors';
export * from './store';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/client`
Expected: PASS (store 4, api 4, errors 3).

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts packages/client
git commit -m "feat(client): subscribable stores, /api/resource client and sign-in error messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Firebase client, sign-in helpers and live stores, tested against the emulators

**Files:**
- Create: `packages/client/src/firebase.ts`, `src/persistence.ts`, `src/persistence.native.ts`, `src/auth.ts`, `src/stores.ts`
- Modify: `packages/client/src/index.ts`, `packages/client/package.json` (deps), `vitest.config.ts` (emulator `fileParallelism: false`)
- Test: `tests/emulator/client.test.ts`

**Interfaces:**
- Consumes:
  - `ClientConfig`, `Store`, `createStore` (Task 2)
  - `userContextFromAccess`, `USER_ACCESS_COLLECTION`, `UserContext`, `ListFilter`, `listFilters`, `scopeOptions`, `buildUserAccess` (core)
  - `Organization` (`@jci/doctypes`)
  - `seedOrgs` (`tests/emulator/fixtures.ts`)
  - `testProject`, `clearAuth`, `signUp`, `requireEmulators` (`tests/emulator/helpers.ts`). `signUp` creates the user with password `emulator-only-password` in the Auth emulator's default project, `demo-jci`.
- Produces:

```ts
interface FirebaseClient { app: FirebaseApp; auth: Auth; db: Firestore; config: ClientConfig }
function initClient(config: ClientConfig): FirebaseClient            // one instance per appName; connects emulators when emulatorHost is set
function signInWithEmail(client: FirebaseClient, email: string, password: string): Promise<void>
function signInWithGoogle(client: FirebaseClient): Promise<void>     // web popup
function signOutUser(client: FirebaseClient): Promise<void>
function currentIdToken(client: FirebaseClient): Promise<string | null>
type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; uid: string; email: string | null };
type AccessState = { status: 'loading' } | { status: 'ready'; user: UserContext } | { status: 'error'; message: string };
interface QueryDoc { id: string; data: Record<string, unknown> }
type DocsState = { status: 'loading' } | { status: 'ready'; docs: QueryDoc[] } | { status: 'error'; message: string };
type DocState = { status: 'loading' } | { status: 'ready'; doc: QueryDoc | null } | { status: 'error'; message: string };
function createAuthStore(auth: Auth): Store<AuthState>
function createAccessStore(db: Firestore, uid: string): Store<AccessState>
const LIST_LIMIT: 50
function createDocsStore(db: Firestore, collectionName: string, filters: readonly ListFilter[], max?: number): Store<DocsState>   // max default LIST_LIMIT
function createDocStore(db: Firestore, collectionName: string, id: string): Store<DocState>
```

- [ ] **Step 1: Add the dependencies**

```bash
npm install -w @jci/client firebase@^12.19.0
npm install -w @jci/client -D @react-native-async-storage/async-storage@2.2.0 @types/react@~19.2.2
```

Then add a peer dependency to `packages/client/package.json`, so that `peerDependencies` reads:

```json
  "peerDependencies": {
    "@react-native-async-storage/async-storage": "*",
    "react": "*"
  }
```

- [ ] **Step 2: Run the emulator test files one at a time**

In `vitest.config.ts`, add `fileParallelism: false` to the `emulator` project's `test` block, with this comment above it:

```ts
          // The Auth emulator only issues tokens for its default project (demo-jci), which both
          // resource.test.ts and client.test.ts use and clear, so emulator files run one at a time.
          fileParallelism: false,
```

- [ ] **Step 3: Write the failing emulator test**

Create `tests/emulator/client.test.ts`:

```ts
import {
  createAccessStore,
  createAuthStore,
  createDocsStore,
  createDocStore,
  initClient,
  signInWithEmail,
  signOutUser,
  type AccessState,
  type Store,
} from '@jci/client';
import { buildUserAccess, listFilters, scopeOptions } from '@jci/core';
import { Organization } from '@jci/doctypes';
import { deleteApp } from 'firebase/app';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedOrgs } from './fixtures';
import { clearAuth, requireEmulators, signUp, testProject } from './helpers';

// Sign-up tokens come from the Auth emulator's default project, so this file uses demo-jci.
const admin = testProject('demo-jci');
const client = initClient({
  projectId: 'demo-jci',
  apiKey: 'demo-api-key',
  emulatorHost: requireEmulators().firestoreHost.split(':')[0]!,
  apiBaseUrl: 'http://localhost:8888',
  appName: 'client-test',
});
const EMAIL = 'client-member@jci.test';
let uid = '';

/** Resolves with the first snapshot that satisfies `done`. */
function waitFor<T>(store: Store<T>, done: (value: T) => boolean, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out; last state ${JSON.stringify(store.getSnapshot())}`));
    }, timeoutMs);
    const check = () => {
      const value = store.getSnapshot();
      if (!done(value)) return;
      clearTimeout(timer);
      queueMicrotask(() => unsubscribe());
      resolve(value);
    };
    const unsubscribe = store.subscribe(check);
    check();
  });
}

beforeAll(async () => {
  await admin.clear();
  await clearAuth(admin.projectId);
  await seedOrgs(admin.db);
  ({ uid } = await signUp(EMAIL));
  await admin.db
    .collection('userAccess')
    .doc(uid)
    .set(buildUserAccess(uid, 'p-member', [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }]));
});

afterAll(async () => {
  await signOutUser(client).catch(() => {});
  await deleteApp(client.app);
  await admin.close();
});

describe('@jci/client against the emulators', () => {
  const auth = createAuthStore(client.auth);

  it('reports signed out, then signed in', async () => {
    expect((await waitFor(auth, (s) => s.status !== 'loading')).status).toBe('signedOut');
    await signInWithEmail(client, EMAIL, 'emulator-only-password');
    expect(await waitFor(auth, (s) => s.status === 'signedIn')).toEqual({ status: 'signedIn', uid, email: EMAIL });
  });

  it('loads the caller access', async () => {
    const access = (await waitFor(createAccessStore(client.db, uid), (s) => s.status !== 'loading')) as Extract<AccessState, { status: 'ready' }>;
    expect(access.status).toBe('ready');
    expect(access.user).toEqual({ uid, personId: 'p-member', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] });
  });

  it('lists documents with the filters the rules allow', async () => {
    const user = { uid, personId: 'p-member', grants: [{ role: 'Member' as const, orgId: 'jci-kl', withDescendants: false }] };
    const filters = listFilters(Organization, user, scopeOptions(user)[0]!)!;
    const docs = await waitFor(createDocsStore(client.db, Organization.collection, filters), (s) => s.status !== 'loading');
    expect(docs.status).toBe('ready');
    expect(docs.status === 'ready' && docs.docs.map((d) => d.id)).toEqual(['jci-kl']);
  });

  it('reports an error for a query the rules deny', async () => {
    const denied = createDocsStore(client.db, Organization.collection, [{ field: 'orgPath', op: 'array-contains', value: 'jci-malaysia' }]);
    expect((await waitFor(denied, (s) => s.status !== 'loading')).status).toBe('error');
  });

  it('reads single documents, with an error when the rules deny', async () => {
    const kl = await waitFor(createDocStore(client.db, Organization.collection, 'jci-kl'), (s) => s.status !== 'loading');
    expect(kl.status === 'ready' && kl.doc?.data.title).toBe('JCI Kuala Lumpur');
    const pj = await waitFor(createDocStore(client.db, Organization.collection, 'jci-pj'), (s) => s.status !== 'loading');
    expect(pj.status).toBe('error');
  });

  it('signs out', async () => {
    await signOutUser(client);
    expect((await waitFor(auth, (s) => s.status === 'signedOut')).status).toBe('signedOut');
  });
});
```

Run (Java prefix first): `npm run test:emulator`
Expected: FAIL in `client.test.ts`. `initClient`, `createAuthStore` and the other new exports are not exported from `@jci/client`.

- [ ] **Step 4: Write the Firebase client**

Create `packages/client/src/persistence.ts`:

```ts
import type { Persistence } from 'firebase/auth';

/** Web and Node keep the Firebase Auth default persistence. React Native uses persistence.native.ts. */
export function authPersistence(): Persistence | undefined {
  return undefined;
}
```

Create `packages/client/src/persistence.native.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from 'firebase/auth';
import type { Persistence } from 'firebase/auth';

// getReactNativePersistence is only exported by firebase/auth's react-native build,
// which TypeScript does not resolve, so it is read off the module namespace at runtime.
const { getReactNativePersistence } = FirebaseAuth as unknown as {
  getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
};

/** Keeps the signed-in user across app restarts on iOS and Android. */
export function authPersistence(): Persistence | undefined {
  return getReactNativePersistence(AsyncStorage);
}
```

Create `packages/client/src/firebase.ts`:

```ts
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import type { ClientConfig } from './config';
import { authPersistence } from './persistence';

export interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  config: ClientConfig;
}

/** Ports from firebase.json. */
const AUTH_EMULATOR_PORT = 9099;
const FIRESTORE_EMULATOR_PORT = 8080;

const clients = new Map<string, FirebaseClient>();

/** One client per app name. Connects to the emulators when `emulatorHost` is set. */
export function initClient(config: ClientConfig): FirebaseClient {
  const name = config.appName ?? '[DEFAULT]';
  const existing = clients.get(name);
  if (existing) return existing;

  const app = initializeApp(
    { projectId: config.projectId, apiKey: config.apiKey, authDomain: config.authDomain, appId: config.appId },
    name,
  );
  const persistence = authPersistence();
  const auth = persistence ? initializeAuth(app, { persistence }) : getAuth(app);
  const db = getFirestore(app);
  if (config.emulatorHost) {
    connectAuthEmulator(auth, `http://${config.emulatorHost}:${AUTH_EMULATOR_PORT}`, { disableWarnings: true });
    connectFirestoreEmulator(db, config.emulatorHost, FIRESTORE_EMULATOR_PORT);
  }
  const client = { app, auth, db, config };
  clients.set(name, client);
  return client;
}
```

Create `packages/client/src/auth.ts`:

```ts
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import type { FirebaseClient } from './firebase';

export async function signInWithEmail(client: FirebaseClient, email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(client.auth, email, password);
}

/** Web only: native Google sign-in needs an EAS dev build (see m3-followups.md). */
export async function signInWithGoogle(client: FirebaseClient): Promise<void> {
  await signInWithPopup(client.auth, new GoogleAuthProvider());
}

export async function signOutUser(client: FirebaseClient): Promise<void> {
  await signOut(client.auth);
}

export function currentIdToken(client: FirebaseClient): Promise<string | null> {
  const user = client.auth.currentUser;
  return user ? user.getIdToken() : Promise.resolve(null);
}
```

Create `packages/client/src/stores.ts`:

```ts
import { USER_ACCESS_COLLECTION, userContextFromAccess, type ListFilter, type UserContext } from '@jci/core';
import { onAuthStateChanged, type Auth } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import { createStore, type Store } from './store';

export type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; uid: string; email: string | null };
export type AccessState = { status: 'loading' } | { status: 'ready'; user: UserContext } | { status: 'error'; message: string };
export interface QueryDoc {
  id: string;
  data: Record<string, unknown>;
}
export type DocsState = { status: 'loading' } | { status: 'ready'; docs: QueryDoc[] } | { status: 'error'; message: string };
export type DocState = { status: 'loading' } | { status: 'ready'; doc: QueryDoc | null } | { status: 'error'; message: string };

/** Most documents a list query returns until M3c adds paging. */
export const LIST_LIMIT = 50;

export function createAuthStore(auth: Auth): Store<AuthState> {
  return createStore<AuthState>({ status: 'loading' }, (set) =>
    onAuthStateChanged(auth, (user) => set(user ? { status: 'signedIn', uid: user.uid, email: user.email } : { status: 'signedOut' })),
  );
}

/** The caller's grants, live from userAccess/{uid}. A missing doc means no roles. */
export function createAccessStore(db: Firestore, uid: string): Store<AccessState> {
  return createStore<AccessState>({ status: 'loading' }, (set) =>
    onSnapshot(
      doc(db, USER_ACCESS_COLLECTION, uid),
      (snap) => set({ status: 'ready', user: userContextFromAccess(snap.exists() ? snap.data() : null, uid) }),
      (err) => set({ status: 'error', message: err.message }),
    ),
  );
}

/** A live list query. `filters` must come from listFilters so the rules allow it. */
export function createDocsStore(db: Firestore, collectionName: string, filters: readonly ListFilter[], max = LIST_LIMIT): Store<DocsState> {
  const q = query(collection(db, collectionName), ...filters.map((f) => where(f.field, f.op, f.value)), limit(max));
  return createStore<DocsState>({ status: 'loading' }, (set) =>
    onSnapshot(
      q,
      (snap) => set({ status: 'ready', docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })) }),
      (err) => set({ status: 'error', message: err.message }),
    ),
  );
}

export function createDocStore(db: Firestore, collectionName: string, id: string): Store<DocState> {
  return createStore<DocState>({ status: 'loading' }, (set) =>
    onSnapshot(
      doc(db, collectionName, id),
      (snap) => set({ status: 'ready', doc: snap.exists() ? { id: snap.id, data: snap.data() } : null }),
      (err) => set({ status: 'error', message: err.message }),
    ),
  );
}
```

Replace `packages/client/src/index.ts`:

```ts
export * from './api';
export * from './auth';
export * from './config';
export * from './errors';
export * from './firebase';
export * from './store';
export * from './stores';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (Java prefix first): `npm run test:emulator`
Expected: PASS for every file, including the 6 new `client` tests.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts packages/client tests/emulator/client.test.ts
git commit -m "feat(client): Firebase client, sign-in helpers and live Firestore stores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: `@jci/ui` feedback and list building blocks: Spinner, ErrorState, ListItem, Page

**Files:**
- Create: `packages/ui/src/components/Spinner.tsx`, `ErrorState.tsx`, `ListItem.tsx`
- Create: `packages/ui/src/primitives/Page.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/app/app/(dev)/ui-gallery.tsx`
- Test: `packages/ui/src/components/__tests__/feedback.test.tsx`

**Interfaces:**
- Consumes: `Text`, `Heading`, `Box`, `Stack`, `Button`, `useTheme`, `tokens`, `cn` from M1.
- Produces (exported from `@jci/ui`):

```ts
interface SpinnerProps { label?: string; testID?: string }                          // default label 'Loading'
interface ErrorStateProps { title?: string; message: string; retryLabel?: string; onRetry?: () => void; testID?: string }
interface ListItemProps { title: string; subtitle?: string; selected?: boolean; onPress?: () => void; testID?: string }
interface PageProps { children: ReactNode; scroll?: boolean; testID?: string }       // content area inside a layout; no safe area
```

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/components/__tests__/feedback.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Page } from '../../primitives/Page';
import { Text } from '../../primitives/Text';
import { ErrorState } from '../ErrorState';
import { ListItem } from '../ListItem';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('announces what is loading', async () => {
    await render(<Spinner label="Loading members" />);
    expect(screen.getByRole('progressbar', { name: 'Loading members' })).toBeTruthy();
  });

  it('defaults its label to Loading', async () => {
    await render(<Spinner />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeTruthy();
  });
});

describe('ErrorState', () => {
  it('shows the title, the message and a retry button', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState message="Permission denied" onRetry={onRetry} />);
    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeTruthy();
    expect(screen.getByText('Permission denied')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no button without onRetry', async () => {
    await render(<ErrorState title="No access" message="Ask an administrator." />);
    expect(screen.getByRole('header', { name: 'No access' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ListItem', () => {
  it('is a button labelled with its title and subtitle', async () => {
    const onPress = jest.fn();
    await render(<ListItem title="JCI Kuala Lumpur" subtitle="Includes child organisations" selected onPress={onPress} />);
    const item = screen.getByRole('button', { name: 'JCI Kuala Lumpur, Includes child organisations' });
    expect(item.props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(item);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is plain content without onPress', async () => {
    await render(<ListItem title="Read only" />);
    expect(screen.getByText('Read only')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Page', () => {
  it('renders its children, scrolling or not', async () => {
    await render(
      <Page testID="page">
        <Text>Scrolling</Text>
      </Page>,
    );
    expect(screen.getByText('Scrolling')).toBeTruthy();
    await render(
      <Page scroll={false}>
        <Text>Fixed</Text>
      </Page>,
    );
    expect(screen.getByText('Fixed')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @jci/ui -- feedback`
Expected: FAIL with `Cannot find module '../../primitives/Page'` (and the other new modules).

- [ ] **Step 3: Implement the components**

Create `packages/ui/src/components/Spinner.tsx`:

```tsx
import { ActivityIndicator, View } from 'react-native';
import { Text } from '../primitives/Text';
import { useTheme } from '../theme/useTheme';
import { tokens } from '../tokens';

export interface SpinnerProps {
  label?: string;
  testID?: string;
}

export function Spinner({ label = 'Loading', testID }: SpinnerProps) {
  const { scheme } = useTheme();
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label} className="items-center justify-center gap-2 p-6">
      <ActivityIndicator color={tokens.semantic[scheme].primary} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}
```

Create `packages/ui/src/components/ErrorState.tsx`:

```tsx
import { Box } from '../primitives/Box';
import { Heading } from '../primitives/Heading';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  testID?: string;
}

export function ErrorState({ title = 'Something went wrong', message, retryLabel = 'Try again', onRetry, testID }: ErrorStateProps) {
  return (
    <Box testID={testID} padding="lg">
      <Stack gap="sm" align="center">
        <Heading level={3}>{title}</Heading>
        <Text tone="danger" accessibilityLiveRegion="polite">
          {message}
        </Text>
        {onRetry ? <Button label={retryLabel} variant="secondary" onPress={onRetry} /> : null}
      </Stack>
    </Box>
  );
}
```

Create `packages/ui/src/components/ListItem.tsx`:

```tsx
import { Pressable, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}

const ROW = 'min-h-11 flex-row items-center gap-3 rounded-lg px-3 py-2';
const SELECTED = 'bg-surface-muted dark:bg-surface-muted-dark';
const INTERACTIVE =
  'active:opacity-80 web:hover:bg-surface-muted dark:web:hover:bg-surface-muted-dark web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-focus dark:web:focus-visible:ring-focus-dark';

export function ListItem({ title, subtitle, selected = false, onPress, testID }: ListItemProps) {
  const body = (
    <View className="flex-1 gap-0.5">
      <Text variant="label" tone={selected ? 'primary' : 'default'} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) {
    return (
      <View testID={testID} className={cn(ROW, selected && SELECTED)}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(ROW, INTERACTIVE, selected && SELECTED)}
    >
      {body}
    </Pressable>
  );
}
```

Create `packages/ui/src/primitives/Page.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

export interface PageProps {
  children: ReactNode;
  /** Default true. Set false for pages that manage their own scrolling. */
  scroll?: boolean;
  testID?: string;
}

/** Content area inside a layout (DeskShell) that already handles the safe area and background. */
export function Page({ children, scroll = true, testID }: PageProps) {
  if (!scroll) {
    return (
      <View testID={testID} className="flex-1 gap-4 px-4 py-6">
        {children}
      </View>
    );
  }
  return (
    <ScrollView testID={testID} className="flex-1" contentContainerClassName="gap-4 px-4 py-6" keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}
```

In `packages/ui/src/index.ts`:
- Add after the `Screen` export:

```ts
export { Page, type PageProps } from './primitives/Page';
```

- Add after the `EmptyState` export:

```ts
export { Spinner, type SpinnerProps } from './components/Spinner';
export { ErrorState, type ErrorStateProps } from './components/ErrorState';
export { ListItem, type ListItemProps } from './components/ListItem';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @jci/ui`
Expected: PASS, with all earlier suites still green.

- [ ] **Step 5: Add the gallery entries**

In `apps/app/app/(dev)/ui-gallery.tsx`:
- Add `ErrorState`, `ListItem` and `Spinner` to the `@jci/ui` import.
- Add `const [picked, setPicked] = useState('kl');` below the existing `useState` lines.
- Insert these two cards directly before `<Card title="Empty state">`:

```tsx
      <Card title="Feedback">
        <Spinner label="Loading members" />
        <ErrorState message="You don't have permission to see this list." onRetry={() => {}} />
      </Card>

      <Card title="List items">
        <ListItem title="JCI Kuala Lumpur" subtitle="Local" selected={picked === 'kl'} onPress={() => setPicked('kl')} />
        <ListItem title="JCI Malaysia" subtitle="Includes child organisations" selected={picked === 'my'} onPress={() => setPicked('my')} />
        <ListItem title="Read-only row" subtitle="No onPress" />
      </Card>
```

- [ ] **Step 6: Run the checks and commit**

Run: `npm run check`
Expected: PASS. The lint enforcement test still checks that the gallery lints clean.

```bash
git add packages/ui/src apps/app/app/\(dev\)/ui-gallery.tsx
git commit -m "feat(ui): Spinner, ErrorState, ListItem and Page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `@jci/ui` layouts: AuthShell and DeskShell

**Files:**
- Create: `packages/ui/src/layouts/AuthShell.tsx`, `packages/ui/src/layouts/DeskShell.tsx`
- Create: `apps/app/app/(dev)/gallery-auth-shell.tsx`, `apps/app/app/(dev)/gallery-desk-shell.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/app/app/(dev)/ui-gallery.tsx`, `packages/ui/README.md`
- Test: `packages/ui/src/layouts/__tests__/layouts.test.tsx`

**Interfaces:**
- Consumes: `Heading`, `Text`, `Box`, `Stack`, `Button`, `ListItem`, `Page` (Task 4).
- Produces (exported from `@jci/ui`):

```ts
interface AuthShellProps { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; testID?: string }
interface DeskNavItem { key: string; label: string }
interface DeskShellProps {
  title: string;
  nav: readonly DeskNavItem[];
  activeKey?: string;
  onNavigate: (key: string) => void;
  /** Shown under the navigation, e.g. the organisation picker and sign-out. */
  sidebarFooter?: ReactNode;
  children: ReactNode;
  testID?: string;
}
const DESK_WIDE_MIN: 768;
function deskLayout(width: number): 'wide' | 'narrow'
```

`DeskShell` has two layouts:
- **Wide (≥ 768 px):** a 256 px sidebar with the title, the nav and the footer; content fills the rest.
- **Narrow:** a top bar with the title and a Menu/Close button. The nav then replaces the content until the user picks an item.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/layouts/__tests__/layouts.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../../components/Button';
import { Text } from '../../primitives/Text';
import { AuthShell } from '../AuthShell';
import { DESK_WIDE_MIN, DeskShell, deskLayout } from '../DeskShell';

describe('AuthShell', () => {
  it('shows the title, subtitle, form content and footer', async () => {
    await render(
      <AuthShell title="JCI Platform" subtitle="Sign in to continue" footer={<Text>Footer</Text>}>
        <Button label="Sign in" onPress={() => {}} />
      </AuthShell>,
    );
    expect(screen.getByRole('header', { name: 'JCI Platform' })).toBeTruthy();
    expect(screen.getByText('Sign in to continue')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
  });
});

describe('deskLayout', () => {
  it('switches to the sidebar layout at 768 px', () => {
    expect(DESK_WIDE_MIN).toBe(768);
    expect(deskLayout(767)).toBe('narrow');
    expect(deskLayout(768)).toBe('wide');
  });
});

describe('DeskShell (narrow, the jest default window)', () => {
  const nav = [
    { key: 'Organization', label: 'Organization' },
    { key: 'RoleAssignment', label: 'Role Assignment' },
  ];

  it('shows content with a menu button, and the nav when the menu opens', async () => {
    const onNavigate = jest.fn();
    await render(
      <DeskShell title="JCI Desk" nav={nav} activeKey="Organization" onNavigate={onNavigate} sidebarFooter={<Text>Signed in</Text>}>
        <Text>Page content</Text>
      </DeskShell>,
    );
    expect(screen.getByRole('header', { name: 'JCI Desk' })).toBeTruthy();
    expect(screen.getByText('Page content')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Role Assignment' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.queryByText('Page content')).toBeNull();
    expect(screen.getByRole('button', { name: 'Organization' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('Signed in')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Role Assignment' }));
    expect(onNavigate).toHaveBeenCalledWith('RoleAssignment');
    expect(screen.getByText('Page content')).toBeTruthy();
  });

  it('closes the menu without navigating', async () => {
    const onNavigate = jest.fn();
    await render(
      <DeskShell title="JCI Desk" nav={nav} onNavigate={onNavigate}>
        <Text>Page content</Text>
      </DeskShell>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText('Page content')).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @jci/ui -- layouts`
Expected: FAIL with `Cannot find module '../AuthShell'`.

- [ ] **Step 3: Implement the layouts**

Create `packages/ui/src/layouts/AuthShell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Box } from '../primitives/Box';
import { Heading } from '../primitives/Heading';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';

export interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}

/** Full-screen, centred card for sign-in screens. */
export function AuthShell({ title, subtitle, children, footer, testID }: AuthShellProps) {
  return (
    <SafeAreaView testID={testID} className="flex-1 bg-background dark:bg-background-dark">
      <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-10" keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-sm gap-6">
          <View className="gap-1">
            <Heading level={1}>{title}</Heading>
            {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
          </View>
          <Box surface="surface" padding="lg" rounded bordered>
            <Stack gap="md">{children}</Stack>
          </Box>
          {footer}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

Create `packages/ui/src/layouts/DeskShell.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ListItem } from '../components/ListItem';
import { Heading } from '../primitives/Heading';

export interface DeskNavItem {
  key: string;
  label: string;
}

export interface DeskShellProps {
  title: string;
  nav: readonly DeskNavItem[];
  activeKey?: string;
  onNavigate: (key: string) => void;
  /** Shown under the navigation, e.g. the organisation picker and sign-out. */
  sidebarFooter?: ReactNode;
  children: ReactNode;
  testID?: string;
}

/** Windows at least this wide get the sidebar layout. */
export const DESK_WIDE_MIN = 768;

export function deskLayout(width: number): 'wide' | 'narrow' {
  return width >= DESK_WIDE_MIN ? 'wide' : 'narrow';
}

/** Admin layout: sidebar navigation on wide screens, a top bar with a menu on narrow ones. */
export function DeskShell({ title, nav, activeKey, onNavigate, sidebarFooter, children, testID }: DeskShellProps) {
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = (key: string) => {
    setMenuOpen(false);
    onNavigate(key);
  };

  const navigation = (
    <ScrollView className="flex-1" contentContainerClassName="gap-1 p-3" accessibilityLabel="Main navigation">
      {nav.map((item) => (
        <ListItem key={item.key} testID={`nav-${item.key}`} title={item.label} selected={item.key === activeKey} onPress={() => navigate(item.key)} />
      ))}
      {sidebarFooter ? <View className="mt-4 gap-2 border-t border-border pt-4 dark:border-border-dark">{sidebarFooter}</View> : null}
    </ScrollView>
  );

  if (deskLayout(width) === 'wide') {
    return (
      <SafeAreaView testID={testID} className="flex-1 flex-row bg-background dark:bg-background-dark">
        <View className="w-64 border-r border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
          <View className="px-4 pb-2 pt-4">
            <Heading level={3}>{title}</Heading>
          </View>
          {navigation}
        </View>
        <View className="flex-1">{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID={testID} className="flex-1 bg-background dark:bg-background-dark">
      <View className="min-h-12 flex-row items-center justify-between border-b border-border bg-surface px-4 dark:border-border-dark dark:bg-surface-dark">
        <Heading level={3}>{title}</Heading>
        <Button
          label={menuOpen ? 'Close' : 'Menu'}
          variant="ghost"
          size="sm"
          accessibilityHint={menuOpen ? 'Hides the navigation' : 'Shows the navigation'}
          onPress={() => setMenuOpen((open) => !open)}
        />
      </View>
      {menuOpen ? <View className="flex-1 bg-surface dark:bg-surface-dark">{navigation}</View> : <View className="flex-1">{children}</View>}
    </SafeAreaView>
  );
}
```

In `packages/ui/src/index.ts`, append:

```ts
export { AuthShell, type AuthShellProps } from './layouts/AuthShell';
export { DeskShell, deskLayout, DESK_WIDE_MIN, type DeskShellProps, type DeskNavItem } from './layouts/DeskShell';
```

In `packages/ui/README.md`, change item 1 of "Adding or changing UI" to:

```markdown
1. Need something that doesn't exist? Build it here first: `src/primitives/` for layout and typography, `src/components/` for everything else, `src/layouts/` for full-screen shells.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @jci/ui`
Expected: PASS.

- [ ] **Step 5: Add the gallery routes**

Create `apps/app/app/(dev)/gallery-auth-shell.tsx`:

```tsx
import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { AuthShell, Button, Input } from '@jci/ui';

export default function GalleryAuthShell() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <AuthShell title="JCI Platform" subtitle="Sign in to continue" footer={<Button label="Back to gallery" variant="ghost" onPress={() => router.back()} />}>
      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Password" value="" onChangeText={() => {}} secureTextEntry />
      <Button label="Sign in" fullWidth onPress={() => {}} />
    </AuthShell>
  );
}
```

Create `apps/app/app/(dev)/gallery-desk-shell.tsx`:

```tsx
import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Button, DeskShell, Heading, Page, Text } from '@jci/ui';

const NAV = [
  { key: 'Organization', label: 'Organization' },
  { key: 'RoleAssignment', label: 'Role Assignment' },
  { key: 'CustomField', label: 'Custom Field' },
];

export default function GalleryDeskShell() {
  const router = useRouter();
  const [active, setActive] = useState('Organization');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <DeskShell
      title="JCI Desk"
      nav={NAV}
      activeKey={active}
      onNavigate={setActive}
      sidebarFooter={<Button label="Back to gallery" variant="secondary" size="sm" onPress={() => router.back()} />}
    >
      <Page>
        <Heading level={2}>{active}</Heading>
        <Text tone="muted">Resize the window: at 768 px and wider the navigation is a sidebar.</Text>
      </Page>
    </DeskShell>
  );
}
```

In `apps/app/app/(dev)/ui-gallery.tsx`:
- Add `useRouter` to the `expo-router` import.
- Add `const router = useRouter();` as the first line of the component.
- Append this card as the last child of `<Screen>`:

```tsx
      <Card title="Layouts">
        <Stack direction="row" gap="sm" wrap>
          <Button label="AuthShell" variant="secondary" onPress={() => router.push('/gallery-auth-shell')} />
          <Button label="DeskShell" variant="secondary" onPress={() => router.push('/gallery-desk-shell')} />
        </Stack>
      </Card>
```

- [ ] **Step 6: Run the checks and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add packages/ui apps/app/app/\(dev\)
git commit -m "feat(ui): AuthShell and DeskShell layouts with gallery demos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: App sign-in: React bindings, config, auth routing and the login screen

**Files:**
- Create: `packages/client/src/react.tsx`
- Create: `apps/app/src/config.ts`, `apps/app/src/client.ts`
- Create: `apps/app/app/(auth)/_layout.tsx`, `apps/app/app/(auth)/login.tsx`
- Create: `apps/app/app/(desk)/_layout.tsx`, `apps/app/app/(desk)/desk/index.tsx`. Task 7 replaces these; for now they are a signed-in placeholder.
- Modify: `apps/app/app/_layout.tsx`, `apps/app/app/index.tsx`, `apps/app/package.json`, `apps/app/app.json`, `netlify.toml`

**Interfaces:**
- Consumes:
  - from Tasks 2–3: `initClient`, `FirebaseClient`, `ClientConfig`, `createApiClient`, `ApiClient`, `createAuthStore`, `createAccessStore`, `createDocsStore`, `createDocStore`, the state types, `constantStore`, `Store`, `currentIdToken`, `signInWithEmail`, `signInWithGoogle`, `signOutUser`, `authErrorMessage`;
  - from Tasks 4–5: `AuthShell`, `Spinner`, `Screen`, `Page`.
- Produces:
  - `@jci/client/react`:

```tsx
function ClientProvider(props: { client: FirebaseClient; children: ReactNode }): JSX.Element
function useClient(): { client: FirebaseClient; api: ApiClient; auth: Store<AuthState> }
function useStore<T>(store: Store<T>): T
function useAuthState(): AuthState
function useAccess(uid: string | null): AccessState                       // 'loading' while uid is null
function useDocs(collection: string | null, filters: readonly ListFilter[] | null): DocsState   // null inputs → ready, []
function useDocument(collection: string | null, id: string | null): DocState                    // null inputs → ready, null
```

  - App modules: `clientConfig` (`apps/app/src/config.ts`) and `client` (`apps/app/src/client.ts`).
  - Routes:
    - `/` redirects by auth state.
    - `/login` holds the email form, plus Google on web; signed-in users are redirected to `/desk`.
    - `/desk` requires sign-in.

- [ ] **Step 1: Add the app dependencies and the web output mode**

In `apps/app/package.json`, add `"@jci/client": "*"` and `"@jci/doctypes": "*"` to `dependencies`. Then:

```bash
cd apps/app && npx expo install @react-native-async-storage/async-storage && cd ../..
npm install
```

Expected: `apps/app/package.json` now lists `"@react-native-async-storage/async-storage": "2.2.0"`.

In `apps/app/app.json`, change `"web": { "output": "static", ... }` to `"output": "single"`.

Append to `netlify.toml`:

```toml
# Single-page app: unknown paths serve the app shell. Functions with a config.path (/api/resource) match first.
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 2: Write the React bindings**

Create `packages/client/src/react.tsx`:

```tsx
import type { ListFilter } from '@jci/core';
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createApiClient, type ApiClient } from './api';
import { currentIdToken } from './auth';
import type { FirebaseClient } from './firebase';
import { constantStore, type Store } from './store';
import {
  createAccessStore,
  createAuthStore,
  createDocsStore,
  createDocStore,
  type AccessState,
  type AuthState,
  type DocsState,
  type DocState,
} from './stores';

interface ClientContextValue {
  client: FirebaseClient;
  api: ApiClient;
  auth: Store<AuthState>;
}

const ClientContext = createContext<ClientContextValue | null>(null);

export function ClientProvider({ client, children }: { client: FirebaseClient; children: ReactNode }) {
  const value = useMemo<ClientContextValue>(
    () => ({
      client,
      api: createApiClient({ baseUrl: client.config.apiBaseUrl, getIdToken: () => currentIdToken(client) }),
      auth: createAuthStore(client.auth),
    }),
    [client],
  );
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient(): ClientContextValue {
  const value = useContext(ClientContext);
  if (!value) throw new Error('useClient must be used inside <ClientProvider>');
  return value;
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useAuthState(): AuthState {
  return useStore(useClient().auth);
}

const ACCESS_LOADING = constantStore<AccessState>({ status: 'loading' });
const NO_DOCS = constantStore<DocsState>({ status: 'ready', docs: [] });
const NO_DOC = constantStore<DocState>({ status: 'ready', doc: null });

export function useAccess(uid: string | null): AccessState {
  const { client } = useClient();
  const store = useMemo(() => (uid ? createAccessStore(client.db, uid) : ACCESS_LOADING), [client, uid]);
  return useStore(store);
}

/** A live list. Pass the filters from listFilters; null means "nothing to show here". */
export function useDocs(collection: string | null, filters: readonly ListFilter[] | null): DocsState {
  const { client } = useClient();
  // Filters are rebuilt on every render; key the store on their content, not their identity.
  const key = filters ? JSON.stringify(filters) : null;
  const store = useMemo(
    () => (collection && key !== null ? createDocsStore(client.db, collection, JSON.parse(key) as ListFilter[]) : NO_DOCS),
    [client, collection, key],
  );
  return useStore(store);
}

export function useDocument(collection: string | null, id: string | null): DocState {
  const { client } = useClient();
  const store = useMemo(() => (collection && id ? createDocStore(client.db, collection, id) : NO_DOC), [client, collection, id]);
  return useStore(store);
}
```

Run: `npx tsc -p packages/client --noEmit`
Expected: no errors.

- [ ] **Step 3: Write the app config and client singleton**

Create `apps/app/src/config.ts`:

```ts
import type { ClientConfig } from '@jci/client';
import { Platform } from 'react-native';

// The Android emulator reaches the PC at 10.0.2.2; web and the iOS simulator use localhost.
// A physical phone needs EXPO_PUBLIC_EMULATOR_HOST / EXPO_PUBLIC_API_BASE_URL set to the PC's LAN address.
const LOCAL_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const useEmulators = process.env.EXPO_PUBLIC_USE_EMULATORS !== 'false';

export const clientConfig: ClientConfig = {
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-jci',
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'demo-api-key',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  emulatorHost: useEmulators ? (process.env.EXPO_PUBLIC_EMULATOR_HOST ?? LOCAL_HOST) : undefined,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? `http://${LOCAL_HOST}:8888`,
};
```

Create `apps/app/src/client.ts`:

```ts
import { initClient } from '@jci/client';
import { clientConfig } from './config';

/** The app's single Firebase client. */
export const client = initClient(clientConfig);
```

- [ ] **Step 4: Wire up the root layout and the auth routing**

Replace `apps/app/app/_layout.tsx`:

```tsx
import '../global.css';
import { ClientProvider } from '@jci/client/react';
import { Stack } from 'expo-router';
import { client } from '../src/client';

export default function RootLayout() {
  return (
    <ClientProvider client={client}>
      <Stack screenOptions={{ headerShown: false }} />
    </ClientProvider>
  );
}
```

Replace `apps/app/app/index.tsx`:

```tsx
import { useAuthState } from '@jci/client/react';
import { Redirect } from 'expo-router';
import { Screen, Spinner } from '@jci/ui';

export default function Index() {
  const auth = useAuthState();
  if (auth.status === 'loading') {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }
  return <Redirect href={auth.status === 'signedIn' ? '/desk' : '/login'} />;
}
```

Create `apps/app/app/(auth)/_layout.tsx`:

```tsx
import { useAuthState } from '@jci/client/react';
import { Redirect, Stack } from 'expo-router';
import { Screen, Spinner } from '@jci/ui';

export default function AuthLayout() {
  const auth = useAuthState();
  if (auth.status === 'loading') {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }
  if (auth.status === 'signedIn') return <Redirect href="/desk" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

Create `apps/app/app/(auth)/login.tsx`:

```tsx
import { useState } from 'react';
import { authErrorMessage, signInWithEmail, signInWithGoogle } from '@jci/client';
import { useClient } from '@jci/client/react';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { AuthShell, Button, Input } from '@jci/ui';

export default function Login() {
  const { client } = useClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="JCI Platform"
      subtitle="Sign in to continue"
      footer={__DEV__ ? <Button label="Open UI gallery" variant="ghost" onPress={() => router.push('/ui-gallery')} /> : null}
    >
      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry error={error ?? undefined} />
      <Button
        label="Sign in"
        fullWidth
        loading={busy}
        disabled={email.trim() === '' || password === ''}
        onPress={() => run(() => signInWithEmail(client, email.trim(), password))}
      />
      {Platform.OS === 'web' ? (
        <Button label="Continue with Google" variant="secondary" fullWidth disabled={busy} onPress={() => run(() => signInWithGoogle(client))} />
      ) : null}
    </AuthShell>
  );
}
```

Create `apps/app/app/(desk)/_layout.tsx`. Task 7 replaces this placeholder:

```tsx
import { useAuthState } from '@jci/client/react';
import { Redirect, Slot } from 'expo-router';
import { Screen, Spinner } from '@jci/ui';

export default function DeskLayout() {
  const auth = useAuthState();
  if (auth.status === 'loading') {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }
  if (auth.status === 'signedOut') return <Redirect href="/login" />;
  return <Slot />;
}
```

Create `apps/app/app/(desk)/desk/index.tsx`. Task 7 replaces this placeholder:

```tsx
import { signOutUser } from '@jci/client';
import { useAuthState, useClient } from '@jci/client/react';
import { Button, Heading, Screen, Text } from '@jci/ui';

export default function DeskHome() {
  const { client } = useClient();
  const auth = useAuthState();
  return (
    <Screen>
      <Heading level={1}>Desk</Heading>
      <Text tone="muted">{auth.status === 'signedIn' ? `Signed in as ${auth.email ?? auth.uid}` : ''}</Text>
      <Button label="Sign out" variant="secondary" onPress={() => signOutUser(client)} />
    </Screen>
  );
}
```

- [ ] **Step 5: Verify the build and checks**

Run: `npm run check`
Expected: PASS. Lint accepts the screens because they only use `@jci/ui`, `expo-router`, `Platform` and `@jci/client`.

Run: `npm run build:web`
Expected: PASS, with `apps/app/dist/index.html` produced in single-page mode.

- [ ] **Step 6: Check sign-in by hand on web**

Start the emulators in the background (Java prefix first): `npm run emulators`. Then:

```bash
npm run seed:dev
cd apps/app && npx expo start --web --port 8081
```

Run Expo in the background too. Port 8081 may already be taken by an Expo server started earlier; if it is, stop only that Expo server first.

Open `http://localhost:8081` in the browser pane and check:
- The page redirects to `/login` and shows the AuthShell.
- A wrong password shows "Email or password is incorrect." under the password field.
- `admin@jci.test` with `jci-dev-password` redirects to `/desk`, which shows "Signed in as admin@jci.test".
- Sign out goes back to `/login`.

Stop the Expo server and the emulators you started.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/react.tsx apps/app netlify.toml package-lock.json
git commit -m "feat(app): email and Google sign-in with auth-guarded routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: The Desk: navigation by permission, organisation scope, read-only lists

**Files:**
- Create: `apps/app/src/desk/DeskContext.tsx`, `apps/app/src/desk/ScopePicker.tsx`, `apps/app/src/desk/DeskFrame.tsx`
- Create: `apps/app/app/(desk)/desk/[doctype]/index.tsx`
- Modify (replace the Task 6 placeholders): `apps/app/app/(desk)/_layout.tsx`, `apps/app/app/(desk)/desk/index.tsx`
- Modify: `scripts/seed-dev.mts` (adds `member@jci.test`)

**Interfaces:**
- Consumes:
  - `readableDocTypes`, `docTypeLabel`, `listFilters`, `scopeOptions`, `ScopeOption`, `UserContext`, `ORGANIZATION_DOCTYPE`, `ROLE_ASSIGNMENT_DOCTYPE` (core)
  - `registry`, `orgDocs`, `SEED_ORGS` (`@jci/doctypes`)
  - `useAuthState`, `useAccess`, `useClient`, `useDocs`, `useDocument` (`@jci/client/react`)
  - `signOutUser`, `LIST_LIMIT` (`@jci/client`)
  - `DeskShell`, `Page`, `ListItem`, `Spinner`, `ErrorState`, `EmptyState`, `Heading`, `Text`, `Stack`, `Button`, `Screen` (`@jci/ui`)
  - `rebuildUserAccess`, `firestoreFor` (server `_shared`)
- Produces:
  - `DeskProvider({ user, children })`
  - `useDesk(): { user: UserContext; options: ScopeOption[]; scope: ScopeOption | null; setScope(orgId: string): void }`
  - `ScopePicker()`
  - `DeskFrame({ uid, email })`
  - the route `/desk/[doctype]`

Route behaviour:
- `/desk` is the home page. Users with no readable DocType see "No access yet".
- `/desk/[doctype]`:
  - an unknown or child DocType shows "Unknown DocType";
  - a DocType the user can't read in the current scope shows "Not available here";
  - otherwise it shows a live list of up to `LIST_LIMIT` documents by their `titleField`, with the id as the subtitle.

- [ ] **Step 1: Write the Desk context and the scope picker**

Create `apps/app/src/desk/DeskContext.tsx`:

```tsx
import { scopeOptions, type ScopeOption, type UserContext } from '@jci/core';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface DeskContextValue {
  user: UserContext;
  options: ScopeOption[];
  /** The organisation the Desk shows; the widest option until the user picks one. */
  scope: ScopeOption | null;
  setScope: (orgId: string) => void;
}

const DeskContext = createContext<DeskContextValue | null>(null);

export function DeskProvider({ user, children }: { user: UserContext; children: ReactNode }) {
  const options = useMemo(() => scopeOptions(user), [user]);
  const [selected, setSelected] = useState<string | null>(null);
  const scope = options.find((o) => o.orgId === selected) ?? options[0] ?? null;
  const value = useMemo(() => ({ user, options, scope, setScope: setSelected }), [user, options, scope]);
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useDesk(): DeskContextValue {
  const value = useContext(DeskContext);
  if (!value) throw new Error('useDesk must be used inside <DeskProvider>');
  return value;
}
```

Create `apps/app/src/desk/ScopePicker.tsx`:

```tsx
import { ORGANIZATION_DOCTYPE, type ScopeOption } from '@jci/core';
import { useDocument } from '@jci/client/react';
import { registry } from '@jci/doctypes';
import { ListItem, Stack, Text } from '@jci/ui';
import { useDesk } from './DeskContext';

const ORGANIZATIONS = registry.get(ORGANIZATION_DOCTYPE).collection;

export function ScopePicker() {
  const { options, scope, setScope } = useDesk();
  if (options.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text variant="caption" tone="muted">
        Organisation
      </Text>
      {options.map((option) => (
        <ScopeItem
          key={option.orgId}
          option={option}
          selected={option.orgId === scope?.orgId}
          onPress={options.length > 1 ? () => setScope(option.orgId) : undefined}
        />
      ))}
    </Stack>
  );
}

function ScopeItem({ option, selected, onPress }: { option: ScopeOption; selected: boolean; onPress?: () => void }) {
  const org = useDocument(ORGANIZATIONS, option.orgId);
  // Some roles cannot read Organization documents; fall back to the id.
  const title = org.status === 'ready' && typeof org.doc?.data.title === 'string' ? org.doc.data.title : option.orgId;
  return (
    <ListItem
      testID={`scope-${option.orgId}`}
      title={title}
      subtitle={option.withDescendants ? 'Includes child organisations' : undefined}
      selected={selected}
      onPress={onPress}
    />
  );
}
```

- [ ] **Step 2: Write the Desk frame and the routes**

Create `apps/app/src/desk/DeskFrame.tsx`:

```tsx
import { signOutUser } from '@jci/client';
import { useAccess, useClient } from '@jci/client/react';
import { docTypeLabel, readableDocTypes } from '@jci/core';
import { registry } from '@jci/doctypes';
import { Slot, usePathname, useRouter } from 'expo-router';
import { Button, DeskShell, ErrorState, Screen, Spinner, Text } from '@jci/ui';
import { DeskProvider } from './DeskContext';
import { ScopePicker } from './ScopePicker';

/** Loads the caller's access, then renders the Desk shell around the current /desk route. */
export function DeskFrame({ uid, email }: { uid: string; email: string | null }) {
  const { client } = useClient();
  const access = useAccess(uid);
  const router = useRouter();
  const pathname = usePathname();

  if (access.status === 'loading') {
    return (
      <Screen>
        <Spinner label="Loading your access" />
      </Screen>
    );
  }
  if (access.status === 'error') {
    return (
      <Screen>
        <ErrorState title="Could not load your access" message={access.message} />
      </Screen>
    );
  }

  const nav = readableDocTypes(registry.all(), access.user).map((meta) => ({ key: meta.name, label: docTypeLabel(meta) }));
  return (
    <DeskProvider user={access.user}>
      <DeskShell
        title="JCI Desk"
        nav={nav}
        activeKey={pathname.split('/')[2]}
        onNavigate={(doctype) => router.push({ pathname: '/desk/[doctype]', params: { doctype } })}
        sidebarFooter={
          <>
            <ScopePicker />
            <Text variant="caption" tone="muted">
              {email ?? uid}
            </Text>
            <Button label="Sign out" variant="secondary" size="sm" onPress={() => signOutUser(client)} />
          </>
        }
      >
        <Slot />
      </DeskShell>
    </DeskProvider>
  );
}
```

Replace `apps/app/app/(desk)/_layout.tsx`:

```tsx
import { useAuthState } from '@jci/client/react';
import { Redirect } from 'expo-router';
import { Screen, Spinner } from '@jci/ui';
import { DeskFrame } from '../../src/desk/DeskFrame';

export default function DeskLayout() {
  const auth = useAuthState();
  if (auth.status === 'loading') {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }
  if (auth.status === 'signedOut') return <Redirect href="/login" />;
  return <DeskFrame uid={auth.uid} email={auth.email} />;
}
```

Replace `apps/app/app/(desk)/desk/index.tsx`:

```tsx
import { readableDocTypes } from '@jci/core';
import { registry } from '@jci/doctypes';
import { EmptyState, Heading, Page, Text } from '@jci/ui';
import { useDesk } from '../../../src/desk/DeskContext';

export default function DeskHome() {
  const { user } = useDesk();
  const readable = readableDocTypes(registry.all(), user);
  return (
    <Page>
      <Heading level={1}>Desk</Heading>
      {readable.length === 0 ? (
        <EmptyState title="No access yet" description="Ask an administrator to give you a role." />
      ) : (
        <Text tone="muted">Choose what to work on from the menu.</Text>
      )}
    </Page>
  );
}
```

Create `apps/app/app/(desk)/desk/[doctype]/index.tsx`:

```tsx
import { LIST_LIMIT } from '@jci/client';
import { useDocs } from '@jci/client/react';
import { docTypeLabel, listFilters } from '@jci/core';
import { registry } from '@jci/doctypes';
import { useLocalSearchParams } from 'expo-router';
import { EmptyState, ErrorState, Heading, ListItem, Page, Spinner, Stack, Text } from '@jci/ui';
import { useDesk } from '../../../../src/desk/DeskContext';

export default function DocTypeList() {
  const { doctype } = useLocalSearchParams<{ doctype: string }>();
  const { user, scope } = useDesk();
  const meta = typeof doctype === 'string' && registry.has(doctype) && !registry.get(doctype).isChild ? registry.get(doctype) : null;
  const filters = meta ? listFilters(meta, user, scope) : null;
  const docs = useDocs(meta?.collection ?? null, filters);

  if (!meta) {
    return (
      <Page>
        <EmptyState title="Unknown DocType" description={`There is no DocType called "${String(doctype)}".`} />
      </Page>
    );
  }
  const label = docTypeLabel(meta);
  if (!filters) {
    return (
      <Page>
        <Heading level={1}>{label}</Heading>
        <EmptyState title="Not available here" description={`You can't see ${label} in this organisation. Pick another one from the menu.`} />
      </Page>
    );
  }

  return (
    <Page>
      <Stack direction="row" justify="between" align="center">
        <Heading level={1}>{label}</Heading>
        {docs.status === 'ready' ? (
          <Text tone="muted">{docs.docs.length === LIST_LIMIT ? `First ${LIST_LIMIT}` : String(docs.docs.length)}</Text>
        ) : null}
      </Stack>
      {docs.status === 'loading' ? <Spinner label={`Loading ${label}`} /> : null}
      {docs.status === 'error' ? <ErrorState message={docs.message} /> : null}
      {docs.status === 'ready' && docs.docs.length === 0 ? <EmptyState title={`No ${label} yet`} /> : null}
      {docs.status === 'ready'
        ? docs.docs.map((d) => {
            const raw = meta.titleField ? d.data[meta.titleField] : undefined;
            const title = typeof raw === 'string' && raw !== '' ? raw : d.id;
            return <ListItem key={d.id} testID={`row-${d.id}`} title={title} subtitle={title === d.id ? undefined : d.id} />;
          })
        : null}
    </Page>
  );
}
```

- [ ] **Step 3: Seed a member account**

Replace `scripts/seed-dev.mts`:

```ts
import { ORGANIZATION_DOCTYPE, ROLE_ASSIGNMENT_DOCTYPE, type RoleName } from '@jci/core';
import { orgDocs, registry, SEED_ORGS } from '@jci/doctypes';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { rebuildUserAccess } from '../netlify/functions/_shared/access';
import { firestoreFor } from '../netlify/functions/_shared/admin';

// Emulator only. The hosts match firebase.json, and a demo- project can never reach production.
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const PROJECT_ID = 'demo-jci';
/** Dev-only accounts that exist only in the Auth emulator. */
const DEV_PASSWORD = 'jci-dev-password';
const DEV_USERS: { email: string; role: RoleName; orgId: string; withDescendants: boolean }[] = [
  { email: 'admin@jci.test', role: 'SystemManager', orgId: 'jci', withDescendants: true },
  { email: 'member@jci.test', role: 'Member', orgId: 'jci-kl', withDescendants: false },
];

const app = initializeApp({ projectId: PROJECT_ID });
const db = firestoreFor(app);
const auth = getAuth(app);

const orgs = orgDocs(SEED_ORGS);
const organizations = registry.get(ORGANIZATION_DOCTYPE).collection;
for (const org of orgs) await db.collection(organizations).doc(String(org.id)).set(org);
console.log(`Seeded ${orgs.length} organisations.`);

const assignments = registry.get(ROLE_ASSIGNMENT_DOCTYPE).collection;
for (const user of DEV_USERS) {
  const orgPath = orgs.find((o) => o.id === user.orgId)?.orgPath;
  if (!Array.isArray(orgPath)) throw new Error(`Seed org "${user.orgId}" not found`);
  const existing = await auth.getUserByEmail(user.email).catch(() => null);
  const uid = existing?.uid ?? (await auth.createUser({ email: user.email, password: DEV_PASSWORD })).uid;
  const id = `seed-${uid}`;
  await db
    .collection(assignments)
    .doc(id)
    .set({ id, uid, role: user.role, withDescendants: user.withDescendants, orgId: user.orgId, orgPath, ownerPersonId: null });
  await rebuildUserAccess({ db, registry }, uid);
  console.log(`Seeded ${user.email} (uid ${uid}) as ${user.role} at ${user.orgId}${user.withDescendants ? ' and below' : ''}.`);
}
```

- [ ] **Step 4: Run the checks**

Run: `npm run check`
Expected: PASS.

Run: `npm run build:web`
Expected: PASS.

- [ ] **Step 5: Check the Desk by hand on web**

Start the emulators in the background (Java prefix first): `npm run emulators`. Then run `npm run seed:dev`.

Expected seed output:
- `Seeded 5 organisations.`
- one `Seeded ...` line for each dev user.

Start `cd apps/app && npx expo start --web --port 8081` in the background. Open `http://localhost:8081` in the browser pane at desktop width.

As `admin@jci.test`:
- The sidebar lists **Organization**, **Role Assignment** and **Custom Field**.
- The Organisation section shows **JCI** with "Includes child organisations".
- **Organization** lists 5 rows, including "JCI Kuala Lumpur" with subtitle `jci-kl`.
- **Role Assignment** lists 2 rows: the two seed assignments.
- **Custom Field** shows "No Custom Field yet".

As `member@jci.test` (sign out first):
- The sidebar lists **Organization** and **Custom Field** only.
- The Organisation section shows **JCI Kuala Lumpur**.
- **Organization** lists exactly one row, "JCI Kuala Lumpur".
- Opening `http://localhost:8081/desk/RoleAssignment` directly shows "Not available here".
- `http://localhost:8081/desk/Nope` shows "Unknown DocType".

At a narrow width (resize the pane to 375 px wide), the top bar shows **Menu**, and picking a nav item closes the menu and opens the list.

Stop the Expo server and the emulators you started.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src apps/app/app scripts/seed-dev.mts
git commit -m "feat(app): Desk shell with permission-based navigation, org scope and live read-only lists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Native check, SPA routing check, docs and follow-ups

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/plans/m3-followups.md`

**Interfaces:**
- Consumes: everything above.
- Produces: no code; checks and documentation.

- [ ] **Step 1: Check the app on the Android emulator (Expo Go)**

Prerequisites:
- An Android emulator is running with Expo Go installed. `adb devices` should list `emulator-5554`, and the adb binary is at `$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe`.
- The Firebase emulators are running in the background (Java prefix, `npm run emulators`).
- `npm run seed:dev` has been run.

Start Metro in the background with `cd apps/app && npx expo start --port 8081`. Then open the app:

```bash
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 shell am start -a android.intent.action.VIEW -d "exp://10.0.2.2:8081" host.exp.exponent
```

Wait for the bundle, then take a screenshot to check each step:

```bash
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 exec-out screencap -p > "<scratchpad>/android.png"
```

Check that:
- The login screen shows the AuthShell, and there is no "Continue with Google" button.
- `member@jci.test` / `jci-dev-password` signs in and lands on the Desk with a top bar and a **Menu** button. Use `adb shell input text` and `input tap` to type into and press the fields.
- **Menu → Organization** shows one row, "JCI Kuala Lumpur".
- Force-stopping and reopening the app keeps you signed in, which proves the AsyncStorage persistence works:

```bash
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 shell am force-stop host.exp.exponent
```

  Then run the `am start` command again.

If the app shows a Firebase error on native, **stop and report it with the Metro log and a screenshot. Do not work around it.** Examples:
- `Component auth has not been registered yet`
- a Firestore listener that never leaves "Loading"

The fix could change how `@jci/client` is initialised, so it needs a decision.

Stop Metro and the emulators you started. Leave the Android emulator itself running.

- [ ] **Step 2: Check the SPA fallback leaves the API alone**

```bash
cp .env.example .env
npm run build:web
```

Start `npm run dev:api` in the background, with the emulators running too (Java prefix). Once `http://localhost:8888` responds, run:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:8888/desk/Organization
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS -H "Origin: http://localhost:8081" http://localhost:8888/api/resource/Person
```

Expected:
- `200 text/html...` for the deep link, which is served by the SPA fallback.
- `204` for the API preflight, which shows the function still matches first.

Stop `dev:api` and the emulators, then delete `.env`.

- [ ] **Step 3: Update the README**

In `README.md`, add this section after "Running the API locally":

````markdown
## Running the app locally

1. `npm run emulators` (leave it running).
2. `npm run seed:dev`. This creates the org tree and two emulator-only accounts. Both use the password `jci-dev-password`:
   - `admin@jci.test`: System Manager for everything
   - `member@jci.test`: Member at JCI Kuala Lumpur
3. `cd apps/app`, then one of:
   - `npx expo start --web` for the browser at http://localhost:8081
   - `npx expo start`, then press `a` for the Android emulator. Expo Go reaches the PC at `10.0.2.2`.
4. Sign in. The Desk lists only the DocTypes your roles can read. Lists come straight from Firestore through the generated rules.

Saving (M3b) goes through `/api/resource`, so run `npm run dev:api` alongside when you need writes.

The app reads these `EXPO_PUBLIC_*` variables:
- `EXPO_PUBLIC_USE_EMULATORS`: set it to `false` to use a real Firebase project.
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID` and `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` and `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_EMULATOR_HOST`
- `EXPO_PUBLIC_API_BASE_URL`

The defaults target the `demo-jci` emulators.
````

In the README's Layout table, add a row after `packages/doctypes`:

```markdown
| `packages/client` | `@jci/client`: the Firebase client, live Firestore stores and the `/api/resource` client; `@jci/client/react` has the hooks |
```

- [ ] **Step 4: Record the follow-ups**

Create `docs/superpowers/plans/m3-followups.md`:

```markdown
# M3 follow-ups

## Deferred from M3a
- **Google sign-in on iOS and Android.**
  - It needs an EAS dev build, because Expo Go cannot host native Google sign-in, plus OAuth client ids from a real Firebase project.
  - The login screen only shows "Continue with Google" on web.
- **Physical phones.**
  - The emulators listen on 127.0.0.1. For a real device:
    - set `"host": "0.0.0.0"` for auth and firestore in `firebase.json`;
    - point `EXPO_PUBLIC_EMULATOR_HOST` and `EXPO_PUBLIC_API_BASE_URL` at the PC's LAN address.
- **Password reset and sign-up.**
  - There is no screen for either yet.
  - Accounts come from administrators, and later from the M7 migration.
- **Organisation titles in the scope picker.**
  - The picker reads each grant org's document. Roles that cannot read Organization see the org id instead of the title.
  - This is the "Organization reads only go downward" item in `m2-followups.md`.
- **Lists stop at `LIST_LIMIT` (50), unsorted.** Ordering, paging, search and filters are M3c.
- **Scope options are the user's own grant orgs.**
  - A national officer cannot pick one local inside their subtree yet; they see the whole subtree.
  - Picking a descendant org needs an org tree query, which fits M3c's FilterBar.

## For M3b and M3c
- DocForm must post complete child-table rows in stored order (see `m2-followups.md`).
- Gate controls with `resolveDocAccess`, fed with the custom fields that apply to the document (`customFields` where `targetDocType == X` and `org in orgPath`, read through the global CustomField rules).
- The versions Timeline query needs `doctype` + `docId` + an org filter that matches the rules, plus a composite index for `orderBy('at')`.
```

- [ ] **Step 5: Final verification**

Run: `npm run check`
Expected: PASS.

Run (Java prefix first): `npm run test:emulator`
Expected: PASS, including `listScope` and `client`.

Run: `npm run build:functions`
Expected: PASS.

Run: `npm run build:web`
Expected: PASS.

Run: `git status --short`
Expected: only `README.md` and the new follow-ups file. No `.env` and no `dist/`.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/superpowers/plans/m3-followups.md
git commit -m "docs: running the app locally; M3 follow-ups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## M3a exit criteria
- `npm run check`, `npm run test:emulator`, `npm run build:functions` and `npm run build:web` are all green.
- Every list query the Desk builds is proven against the generated rules in `tests/emulator/listScope.test.ts`, including the owner-only shape.
- On web:
  - sign-in works with email, and with Google through the emulator popup;
  - the Desk nav follows permissions;
  - lists follow the organisation scope;
  - sign-out returns to `/login`.
- On the Android emulator in Expo Go:
  - email sign-in works;
  - the narrow Desk layout works;
  - the session survives an app restart.

## Next plans (written after M3a lands, against the real code)
- **M3b:**
  - `@jci/ui` `fields/`: one FieldControl per field type (Data, Text, Int, Float, Currency, Date, Datetime, Check, Select, Link, Table, AttachImage, JSON).
  - `DocForm`: create and edit through `useClient().api`, gated by `resolveDocAccess`, with sections and tabs, child tables, a LinkPicker and server error mapping.
  - The version Timeline.
  - `/desk/[doctype]/new` and `/desk/[doctype]/[id]`.
- **M3c:**
  - `DocList`: a TanStack table on web, a simplified list on native.
  - Sorting, paging, search over the cached org-scoped list, FilterBar and CSV export.
  - A descendant-org scope picker.
