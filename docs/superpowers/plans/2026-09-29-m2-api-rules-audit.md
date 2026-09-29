# M2 Implementation Plan (save API + Firestore rules + audit trail)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every write goes through one tested server pipeline, `/api/resource`, which checks permissions and validation, runs controller hooks and writes the document, its version entry and its naming counter in one transaction. Firestore rules generated from the DocType registry scope every direct client read by org and deny every direct client write.

**Architecture:**
- `@jci/core` gains four pure pieces used by both server and client:
  - `resolveDocAccess`, one facade over permissions, field locks and schemas
  - the `userAccess` document builder
  - controller types
  - a Firestore rules generator
- The new `@jci/doctypes` package holds the three core DocTypes the pipeline itself depends on: Organization, RoleAssignment and CustomField, with their controllers.
- The new `netlify/` workspace holds the Netlify Function and its `_shared/` modules: Firebase Admin setup, errors, HTTP handling, naming, storage, links, unique values, the pipeline, access sync and effects.
- Everything that touches Firestore is tested with Vitest against the Firebase emulators. Each test file gets its own emulator project id, so files run in parallel.

**Tech Stack:**
- Everything from M1: Node 22, npm workspaces, TypeScript ~5.8, Zod 4, Vitest 3.2
- `firebase-admin` 14 (server), `firebase-tools` 15 (emulators), `@firebase/rules-unit-testing` 5 + `firebase` 12 (rules tests)
- `@netlify/functions` 6 (types only), `tsx` 4 (scripts)
- JDK 21, which the Firestore emulator needs

Spec: `docs/superpowers/specs/2026-09-29-jci-platform-core-member-crm-design.md`
Previous plan: `docs/superpowers/plans/2026-09-29-m1-foundation.md`. Carry-overs: `docs/superpowers/plans/m1-followups.md`.

## Decisions this plan makes (read before starting)

These refine the spec. Each one is deliberate. Raise any disagreement before Task 1, not halfway through.

1. **`userAccess/{uid}` shape.**
   - The doc is `{ uid, personId, grants: RoleGrant[], scopes: { [role]: { exact: string[], subtree: string[] } } }`. The spec sketched `{ personId, roles, orgPaths }`.
   - `grants` feeds the server evaluator.
   - `scopes` is the same data grouped per role, which is the shape Firestore rules can check cheaply: `orgId in exact || orgPath.hasAny(subtree)`.
2. **Locked fields are rejected, not stripped.**
   - A patch that changes a readOnly field, or a field above the caller's permlevel, gets `403 field_not_writable` with the field list.
   - Sending a locked field with its **unchanged** value is allowed, so forms can post whole documents.
   - The spec's verification step ("try to change a permlevel-1 field and check it is rejected") needs exactly this.
3. **Global DocTypes (`orgScoped: false`) use roles held anywhere.**
   - `DocContext.orgPath` becomes `string[] | null`, where `null` means global, and any grant of the role applies.
   - The earlier idea of `orgPath = [hqId]` would stop a KL member reading global lists, because their grant sits at `jci-kl`.
   - An `orgScoped` document with a missing or empty `orgPath` still denies everyone.
4. **The core DocTypes move into M2.**
   - Organization, RoleAssignment and CustomField move from M4 into `packages/doctypes`, because the pipeline needs them: orgs for scope, custom fields for the schema, role assignments for access.
   - Membership DocTypes stay in M4.
   - A fixture `Person` DocType lives only in the emulator tests.
5. **CustomField is a global DocType with an `org` field.**
   - Every signed-in role holder can read the definitions, including ones defined at ancestor orgs, which forms need.
   - Its controller checks that the author administers `org`.
   - Its id is `<targetDocType>.<fieldname>`, so a fieldname is unique per DocType across the whole platform.
6. **New naming kind `{ kind: 'fields', fields: [...] }`.** The id is the values of several reqd Data/Select fields joined with `.`. CustomField needs it.
7. **`afterSave` becomes a server-side effect.**
   - Controllers in `@jci/doctypes` stay pure, with `validate`, `beforeSave` and `beforeDelete`, so the client can share them.
   - Post-commit work lives in `netlify/functions/_shared/effects.ts`. In M2 that is one effect: RoleAssignment rebuilds `userAccess`.
   - If an effect fails, the API answers `500 effect_failed`. The save stays committed, and saving again retries the effect.
8. **Version entries store `changed` as `[{ field, old, new }]`.** Firestore cannot store nested arrays, so `[[field, old, new]]` is impossible. Versions also carry `orgId`, `orgPath` and `ownerPersonId`, so rules can scope timeline reads.
9. **Firestore rules cannot hide fields.**
   - Rules decide per document, so permlevel **read** limits apply only to what the API returns, not to direct client reads.
   - M4 must put sensitive data in its own DocType with narrower read roles. This is recorded in `m2-followups.md` (Task 14).
10. **Emulator only.**
    - M2 uses the `demo-jci` emulator project and creates no real Firebase project.
    - Real project creation, the service account and rules deployment come with the deployment milestone.
    - `/api/method` is not built yet; it arrives with `generateDues` in M6.

**Known risk, tested explicitly in Task 13:**
- Firestore only allows a **list query** when it can prove from the query's filters that every result satisfies the rule.
- The plan expects `where('orgPath', 'array-contains', X)` to satisfy `orgPath.hasAny(scopes[role].subtree)` when X is in the subtree list.
- If the Task 13 list-query test for subtree reads fails, **stop and report to the user**. The fix changes how clients query, so it is a design decision. Do not weaken the rules to make the test pass.

## Global Constraints

- Repo root: `C:\Users\User\Documents\Cursor projects\Frappe`. All paths below are relative to it.
- Commands use Git Bash syntax. Run them from the repo root unless a step says otherwise.
- Work on a branch `m2-api-rules-audit` created from `main`.
- Node ≥ 20.19 (CI uses 22). **JDK 21** must be on PATH for any `test:emulator`/`emulators` command.
- Dev Firebase project id: `demo-jci`. The `demo-` prefix means the emulators need no login and cannot reach production. Emulator ports: Firestore `8080`, Auth `9099`.
- **Hard rule from M1, unchanged:** app code (`apps/app`, `packages/doctypes`) builds its UI only from `@jci/ui`. `packages/doctypes` has no UI in M2; the existing lint config already covers it.
- No hex colour literals anywhere except `packages/ui/src/tokens/tokens.json`.
- The org hierarchy has these levels: `hq > area > national > national_area > local`.
  - `orgPath` lists ancestor ids, **ending with the org's own id**.
  - Every org-scoped stored document carries `orgId` (equal to the last element of `orgPath`) and `orgPath`.
- DocType names are PascalCase. Fieldnames are camelCase. Collection names are camelCase.
  - Reserved fieldnames: `id, orgId, orgPath, ownerPersonId, createdAt, createdBy, updatedAt, updatedBy, custom`.
  - Reserved collections: `userAccess, versions, series, uniqueKeys`.
- Roles: `SystemManager, OrgAdmin, MembershipOfficer, Treasurer, BoardMember, Member, Guest`.
- Naming-series dates use the time zone `Asia/Kuala_Lumpur`.
- **Clients never write Firestore directly.** `firestore.rules` is generated (`npm run gen:rules`) and must never be edited by hand. A unit test fails if it drifts from the registry.
- Every API error response is JSON `{ "error": { "code": string, "message": string, "details"?: object } }`.
  - Validation failures use code `invalid` with `details.issues: [{ path, message }]`.
  - Field locks use code `field_not_writable` with `details.fields: string[]`.
- Server imports use the `@jci/core` and `@jci/doctypes` package names, never relative paths into `packages/`.
- Commit after every task. End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure (end state of M2)

```
package.json                  + "netlify" workspace; scripts gen:rules, emulators, test:emulator, seed:dev
vitest.config.ts              two projects: unit, emulator
tsconfig.server.json          typecheck for netlify/functions, tests/emulator, scripts
firebase.json  .firebaserc  firestore.indexes.json
firestore.rules               GENERATED from the registry
netlify.toml  .env.example  README.md
.github/workflows/ci.yml      + JDK 21, emulator cache, test:emulator
packages/core/src/
  collections.ts              system collection + core DocType names
  errors.ts                   + ValidationError
  meta/defineDocType.ts       + DocPerm/naming/collection checks, deep freeze
  meta/registry.ts            + duplicate/reserved collection checks
  meta/types.ts               + naming kind 'fields'
  meta/customFields.ts        + customFieldFromDoc
  validate/buildSchema.ts     memoised child schemas, z.literal for Select
  perm/evaluate.ts            orgPath: null = global DocType
  perm/access.ts (+ .test.ts) resolveDocAccess, getFieldValue, redactDoc
  access/userAccess.ts (+ .test.ts)  parseGrant, buildUserAccess, userContextFromAccess
  controller/types.ts         HookContext, Controller, ControllerMap, StoredDoc
  rules/generateRules.ts (+ .test.ts)
packages/doctypes/
  package.json  tsconfig.json
  src/index.ts                DOCTYPES, registry, controllers
  src/core/organization.ts  roleAssignment.ts  customField.ts  seed.ts  testContext.ts
  src/core/*.test.ts  src/index.test.ts  src/rules.test.ts
netlify/
  package.json                @jci/functions workspace
  functions/resource.ts       Netlify Function: /api/resource/:doctype[/:id]
  functions/_shared/admin.ts errors.ts http.ts auth.ts naming.ts store.ts
                    links.ts unique.ts pipeline.ts access.ts effects.ts resource.ts
tests/emulator/
  helpers.ts  fixtures.ts
  smoke.test.ts  store.test.ts  pipeline.test.ts  integrity.test.ts
  access.test.ts  resource.test.ts  rules.test.ts
scripts/gen-rules.ts  scripts/seed-dev.ts
docs/superpowers/plans/m2-followups.md
```

---

### Task 1: M1 carry-overs: lint deep subpaths, dark-mode placeholder test

**Files:**
- Modify: `tools/eslint-plugin-jci/restricted-imports.mjs`
- Modify: `tools/eslint-plugin-jci/enforcement.test.mjs`
- Create: `packages/ui/src/components/__tests__/input-dark.test.tsx`

**Interfaces:**
- Consumes: `RESTRICTED_UI_IMPORTS` (the `jci/no-restricted-dynamic-imports` rule derives its lists from it), `Input`, and `tokens.semantic.{light,dark}.textMuted` from M1.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Create the branch**

```bash
git checkout main
git checkout -b m2-api-rules-audit
```

- [ ] **Step 2: Add failing enforcement rows**

In `tools/eslint-plugin-jci/enforcement.test.mjs`, add two rows at the end of the first `it.each([...])` table, the one that ends with the `'safe-area-context subpaths'` row:

```js
    ['a react-native deep import', APP_FILE, "import View from 'react-native/Libraries/Components/View/View';\nexport const x = View;\n"],
    ['a nativewind subpath', APP_FILE, "import { cssInterop } from 'nativewind/dist/runtime';\nexport const x = cssInterop;\n"],
```

Add one row at the end of the dynamic-import `it.each([...])` table, the one that ends with `'a pattern-restricted module'`:

```js
    ['a react-native deep path', "export const load = () => import('react-native/Libraries/Components/View/View');\n"],
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tools/eslint-plugin-jci/enforcement.test.mjs`
Expected: FAIL. The three new rows report `expected [] to include 'no-restricted-imports'` (or `'jci/no-restricted-dynamic-imports'`).

- [ ] **Step 4: Block the subpaths**

In `tools/eslint-plugin-jci/restricted-imports.mjs`, add two entries at the end of the `patterns[0].group` array, after `'react-native-safe-area-context/*'`:

```js
        'react-native/**',
        'nativewind/**',
```

`**` covers every depth. The `paths` entries for bare `react-native` and `nativewind` are unchanged, so allowlisted imports such as `Platform` keep working.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tools/eslint-plugin-jci/enforcement.test.mjs`
Expected: PASS. All rows pass, including `'allows allowlisted react-native APIs'`.

- [ ] **Step 6: Add the dark-mode placeholder test**

Create `packages/ui/src/components/__tests__/input-dark.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { tokens } from '../../tokens';
import { Input } from '../Input';

// The original bug was the dark-mode placeholder colour on web; pin the dark branch.
jest.mock('../../theme/useTheme', () => ({
  useTheme: () => ({ scheme: 'dark', setScheme: jest.fn(), toggle: jest.fn() }),
}));

describe('Input in dark mode', () => {
  it('uses the dark muted text token for the placeholder colour', async () => {
    await render(<Input label="Email" value="" onChangeText={() => {}} placeholder="you@example.com" />);
    const colour = screen.getByLabelText('Email').props.placeholderTextColor;
    expect(colour).toBe(tokens.semantic.dark.textMuted);
    expect(colour).not.toBe(tokens.semantic.light.textMuted);
  });
});
```

- [ ] **Step 7: Run it**

Run: `npm test -w @jci/ui -- input-dark`
Expected: PASS. This is a regression guard; `Input` already reads `tokens.semantic[scheme]`. To confirm the test really guards the dark path, temporarily change `Input.tsx` to `tokens.semantic.light.textMuted` and check that the test fails, then revert the change.

- [ ] **Step 8: Run the full check and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add tools/eslint-plugin-jci packages/ui/src/components/__tests__/input-dark.test.tsx
git commit -m "fix(lint): block react-native and nativewind deep subpaths; test dark placeholder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Core meta hardening (permission rows, naming, collections, schemas)

**Files:**
- Create: `packages/core/src/collections.ts`
- Modify: `packages/core/src/meta/types.ts` (the `Naming` union)
- Modify: `packages/core/src/meta/defineDocType.ts` (full replacement below)
- Modify: `packages/core/src/meta/registry.ts` (full replacement below)
- Modify: `packages/core/src/validate/buildSchema.ts` (Select and Table cases)
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/meta/meta.test.ts`, `packages/core/src/validate/buildSchema.test.ts`

**Interfaces:**
- Consumes: M1 `MetaError`, `parseSeriesPattern`, `FIELD_TYPES`, `ROLES`, `SYSTEM_FIELDS`.
- Produces:
  - Constants: `USER_ACCESS_COLLECTION = 'userAccess'`, `VERSIONS_COLLECTION = 'versions'`, `SERIES_COLLECTION = 'series'`, `UNIQUE_KEYS_COLLECTION = 'uniqueKeys'`, `SYSTEM_COLLECTIONS`, `ORGANIZATION_DOCTYPE = 'Organization'`, `ROLE_ASSIGNMENT_DOCTYPE = 'RoleAssignment'`, `CUSTOM_FIELD_DOCTYPE = 'CustomField'`
  - `Naming` gains `{ kind: 'fields'; fields: readonly string[] }`
  - `validateDocPerm(doctype: string, p: DocPerm): void`
  - `defineDocType` now rejects:
    - unknown roles
    - bad permission permlevels, and create/delete above level 0
    - non-reqd or non-Data/Select naming fields
    - non-camelCase collections
  - `createRegistry` rejects duplicate and reserved collections.

- [ ] **Step 1: Write the failing meta tests**

Append to `packages/core/src/meta/meta.test.ts`:

```ts
describe('permission rows, naming and collections', () => {
  it('rejects unknown roles and bad permlevels in permission rows', () => {
    expect(() => defineDocType({ ...personInput(), permissions: [{ role: 'Admin' as never, read: true }] })).toThrow(/unknown role/);
    expect(() =>
      defineDocType({ ...personInput(), permissions: [{ role: 'Member', permlevel: MAX_PERMLEVEL + 1, read: true }] }),
    ).toThrow(/permlevel/);
    expect(() => defineDocType({ ...personInput(), permissions: [{ role: 'Member', permlevel: 1, create: true }] })).toThrow(
      /permlevel 0/,
    );
  });

  it('requires naming fields to be reqd Data or Select fields', () => {
    expect(() => defineDocType({ ...personInput(), naming: { kind: 'field', field: 'email' } })).toThrow(/reqd/);
    expect(defineDocType({ ...personInput(), naming: { kind: 'field', field: 'fullName' } }).naming).toEqual({
      kind: 'field',
      field: 'fullName',
    });
    expect(() => defineDocType({ ...personInput(), naming: { kind: 'fields', fields: [] } })).toThrow(/at least one/);
    const m = defineDocType({
      ...personInput(),
      fields: [...personInput().fields, { fieldname: 'code', label: 'Code', fieldtype: 'Data', reqd: true }],
      naming: { kind: 'fields', fields: ['fullName', 'code'] },
    });
    expect(m.naming).toEqual({ kind: 'fields', fields: ['fullName', 'code'] });
    expect(Object.isFrozen((m.naming as { fields: readonly string[] }).fields)).toBe(true);
  });

  it('freezes nested field properties', () => {
    const m = defineDocType(personInput());
    const gender = m.fields.find((f) => f.fieldname === 'gender')!;
    expect(Object.isFrozen(gender.options)).toBe(true);
  });

  it('requires a camelCase collection name', () => {
    expect(() => defineDocType({ ...personInput(), collection: 'people/x' })).toThrow(/collection/);
    expect(() => defineDocType({ ...personInput(), collection: 'People' })).toThrow(/collection/);
  });

  it('rejects duplicate and reserved collection names in a registry', () => {
    const a = defineDocType(personInput());
    const b = defineDocType({ ...personInput(), name: 'Contact' });
    expect(() => createRegistry([a, b])).toThrow(/collection "persons"/);
    expect(() => createRegistry([defineDocType({ ...personInput(), collection: 'versions' })])).toThrow(/reserved/);
  });
});
```

- [ ] **Step 2: Write the failing schema test**

In `packages/core/src/validate/buildSchema.test.ts`, add `import type { z } from 'zod';` below the existing `vitest` import. Then add this test inside `describe('buildSchema', ...)`:

```ts
  it('builds each child row schema once and reuses it', () => {
    type TableSchema = z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodType>>>;
    const rows = (s: ReturnType<typeof buildSchema>) => (s.shape.history as TableSchema).unwrap().unwrap().element;
    expect(rows(buildSchema(member, { resolveChild }))).toBe(rows(buildSchema(member, { resolveChild, mode: 'update' })));
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/core`
Expected: FAIL. `kind: 'fields'` is a TypeScript/unknown-naming problem, the role and permlevel checks do not throw yet, the collection checks do not throw yet, and the child schema is a different instance on each build.

- [ ] **Step 4: Add the collections module and the naming kind**

Create `packages/core/src/collections.ts`:

```ts
/** Firestore collections the platform owns (not DocType collections). Only the server writes them. */
export const USER_ACCESS_COLLECTION = 'userAccess';
export const VERSIONS_COLLECTION = 'versions';
export const SERIES_COLLECTION = 'series';
export const UNIQUE_KEYS_COLLECTION = 'uniqueKeys';
export const SYSTEM_COLLECTIONS = [USER_ACCESS_COLLECTION, VERSIONS_COLLECTION, SERIES_COLLECTION, UNIQUE_KEYS_COLLECTION] as const;

/** Core DocTypes the save pipeline relies on by name. */
export const ORGANIZATION_DOCTYPE = 'Organization';
export const ROLE_ASSIGNMENT_DOCTYPE = 'RoleAssignment';
export const CUSTOM_FIELD_DOCTYPE = 'CustomField';
```

In `packages/core/src/meta/types.ts`, replace the `Naming` type with:

```ts
export type Naming =
  | { kind: 'autoId' }
  | { kind: 'series'; pattern: string }
  | { kind: 'field'; field: string }
  /** Id = the values of several reqd Data/Select fields joined with '.'. */
  | { kind: 'fields'; fields: readonly string[] };
```

- [ ] **Step 5: Replace `defineDocType.ts`**

Replace `packages/core/src/meta/defineDocType.ts` with:

```ts
import { MetaError } from '../errors';
import { parseSeriesPattern } from '../naming/series';
import { FIELD_TYPES, ROLES, SYSTEM_FIELDS, type DocPerm, type DocTypeInput, type DocTypeMeta, type FieldDef, type Naming } from './types';

const DOCTYPE_NAME = /^[A-Z][A-Za-z0-9]*$/;
const FIELDNAME = /^[a-z][A-Za-z0-9]*$/;
const COLLECTION = /^[a-z][A-Za-z0-9]*$/;
const RESERVED = new Set<string>([...SYSTEM_FIELDS, 'custom']);
/** Field types whose value can become part of a document id. */
const NAMING_FIELD_TYPES = new Set<string>(['Data', 'Select']);
/** Highest field/permission permlevel accepted (Frappe uses 0-9). */
export const MAX_PERMLEVEL = 9;

function validPermlevel(level: number): boolean {
  return Number.isInteger(level) && level >= 0 && level <= MAX_PERMLEVEL;
}

export function validateField(doctype: string, f: FieldDef): void {
  const where = `${doctype}.${f.fieldname}`;
  if (!FIELDNAME.test(f.fieldname)) throw new MetaError(`${where}: fieldname must be camelCase`);
  if (RESERVED.has(f.fieldname)) throw new MetaError(`${where}: fieldname is reserved`);
  if (!(FIELD_TYPES as readonly string[]).includes(f.fieldtype)) {
    throw new MetaError(`${where}: unknown fieldtype "${f.fieldtype}"`);
  }
  if (f.fieldtype === 'Select' && (!f.options || f.options.length === 0)) {
    throw new MetaError(`${where}: Select fields need options`);
  }
  if (f.fieldtype === 'Link' && !f.link) throw new MetaError(`${where}: Link fields need a link target`);
  if (f.fieldtype === 'Table' && !f.childDocType) throw new MetaError(`${where}: Table fields need a childDocType`);
  if (!validPermlevel(f.permlevel ?? 0)) {
    throw new MetaError(`${where}: permlevel must be an integer 0-${MAX_PERMLEVEL}`);
  }
}

export function validateDocPerm(doctype: string, p: DocPerm): void {
  const where = `${doctype} permission for "${String(p.role)}"`;
  if (!(ROLES as readonly string[]).includes(p.role)) throw new MetaError(`${where}: unknown role`);
  const level = p.permlevel ?? 0;
  if (!validPermlevel(level)) throw new MetaError(`${where}: permlevel must be an integer 0-${MAX_PERMLEVEL}`);
  if (level > 0 && (p.create === true || p.delete === true)) {
    throw new MetaError(`${where}: create and delete only apply at permlevel 0`);
  }
}

function validateNaming(input: DocTypeInput, naming: Naming): void {
  if (naming.kind === 'autoId') return;
  if (naming.kind === 'series') {
    parseSeriesPattern(naming.pattern);
    return;
  }
  const names = naming.kind === 'field' ? [naming.field] : naming.fields;
  if (names.length === 0) throw new MetaError(`${input.name}: naming needs at least one field`);
  for (const name of names) {
    const f = input.fields.find((x) => x.fieldname === name);
    if (!f) throw new MetaError(`${input.name}: naming field "${name}" is not a field`);
    if (f.reqd !== true || !NAMING_FIELD_TYPES.has(f.fieldtype)) {
      throw new MetaError(`${input.name}: naming field "${name}" must be a reqd Data or Select field`);
    }
  }
}

function freezeField(f: FieldDef): FieldDef {
  return Object.freeze({
    ...f,
    ...(f.options ? { options: Object.freeze([...f.options]) } : {}),
    ...(f.dependsOn ? { dependsOn: Object.freeze({ ...f.dependsOn }) } : {}),
  });
}

function freezeNaming(naming: Naming): Naming {
  return Object.freeze(naming.kind === 'fields' ? { ...naming, fields: Object.freeze([...naming.fields]) } : { ...naming });
}

export function defineDocType(input: DocTypeInput): DocTypeMeta {
  if (!DOCTYPE_NAME.test(input.name)) {
    throw new MetaError(`DocType name "${input.name}" must be PascalCase`);
  }
  const isChild = input.isChild ?? false;
  if (!isChild && !input.collection) throw new MetaError(`${input.name}: collection is required`);
  if (input.collection && !COLLECTION.test(input.collection)) {
    throw new MetaError(`${input.name}: collection "${input.collection}" must be camelCase letters and digits`);
  }
  if (isChild && input.permissions && input.permissions.length > 0) {
    throw new MetaError(`${input.name}: child DocTypes inherit permissions from their parent`);
  }
  for (const p of input.permissions ?? []) validateDocPerm(input.name, p);

  const seen = new Set<string>();
  for (const f of input.fields) {
    validateField(input.name, f);
    if (seen.has(f.fieldname)) throw new MetaError(`${input.name}.${f.fieldname}: duplicate fieldname`);
    seen.add(f.fieldname);
  }
  const mustExist = (ref: string, what: string): void => {
    if (!seen.has(ref)) throw new MetaError(`${input.name}: ${what} "${ref}" is not a field`);
  };
  if (input.titleField) mustExist(input.titleField, 'titleField');
  for (const s of input.searchFields ?? []) mustExist(s, 'searchField');
  for (const l of input.listFields ?? []) mustExist(l, 'listField');
  for (const f of input.fields) if (f.dependsOn) mustExist(f.dependsOn.field, `dependsOn of ${f.fieldname}`);

  const naming = input.naming ?? { kind: 'autoId' };
  validateNaming(input, naming);

  return Object.freeze({
    name: input.name,
    module: input.module,
    collection: input.collection ?? '',
    naming: freezeNaming(naming),
    fields: Object.freeze(input.fields.map(freezeField)),
    permissions: Object.freeze((input.permissions ?? []).map((p) => Object.freeze({ ...p }))),
    titleField: input.titleField ?? null,
    searchFields: Object.freeze([...(input.searchFields ?? [])]),
    listFields: Object.freeze([...(input.listFields ?? [])]),
    isChild,
    trackChanges: input.trackChanges ?? true,
    orgScoped: input.orgScoped ?? !isChild,
  });
}
```

- [ ] **Step 6: Replace `registry.ts`**

Replace `packages/core/src/meta/registry.ts` with:

```ts
import { SYSTEM_COLLECTIONS } from '../collections';
import { MetaError } from '../errors';
import type { DocTypeMeta } from './types';

export interface Registry {
  get(name: string): DocTypeMeta;
  has(name: string): boolean;
  all(): readonly DocTypeMeta[];
}

export function createRegistry(metas: readonly DocTypeMeta[]): Registry {
  const map = new Map<string, DocTypeMeta>();
  const collections = new Map<string, string>();
  for (const m of metas) {
    if (map.has(m.name)) throw new MetaError(`Duplicate DocType "${m.name}"`);
    map.set(m.name, m);
    if (m.isChild) continue;
    if ((SYSTEM_COLLECTIONS as readonly string[]).includes(m.collection)) {
      throw new MetaError(`${m.name}: collection "${m.collection}" is reserved`);
    }
    const other = collections.get(m.collection);
    if (other) throw new MetaError(`${m.name}: collection "${m.collection}" is already used by ${other}`);
    collections.set(m.collection, m.name);
  }
  for (const m of metas) {
    for (const f of m.fields) {
      if (f.fieldtype === 'Link' && !map.has(f.link!)) {
        throw new MetaError(`${m.name}.${f.fieldname}: links to unknown DocType "${f.link}"`);
      }
      if (f.fieldtype === 'Table') {
        const child = map.get(f.childDocType!);
        if (!child) throw new MetaError(`${m.name}.${f.fieldname}: unknown DocType "${f.childDocType}"`);
        if (!child.isChild) throw new MetaError(`${m.name}.${f.fieldname}: "${child.name}" is not a child DocType`);
      }
    }
  }
  return {
    get(name) {
      const m = map.get(name);
      if (!m) throw new MetaError(`Unknown DocType "${name}"`);
      return m;
    },
    has: (name) => map.has(name),
    all: () => [...map.values()],
  };
}
```

- [ ] **Step 7: Memoise child schemas and drop the Select cast**

In `packages/core/src/validate/buildSchema.ts`:

1. Add this block after the `hasAtMostTwoDecimals` constant:

```ts
const childSchemas = new WeakMap<DocTypeMeta, z.ZodType>();

/** Child rows have no custom fields and are always complete, so one schema per child DocType is enough. */
function childRowSchema(child: DocTypeMeta, resolveChild: (name: string) => DocTypeMeta): z.ZodType {
  let s = childSchemas.get(child);
  if (!s) {
    s = buildSchema(child, { resolveChild, mode: 'create' });
    childSchemas.set(child, s);
  }
  return s;
}
```

2. Replace the `Select` case with:

```ts
    case 'Select':
      return z.literal(f.options!);
```

3. Replace the `Table` case with:

```ts
    case 'Table': {
      if (!opts.resolveChild) throw new MetaError(`Table field "${f.fieldname}" needs resolveChild`);
      return z.array(childRowSchema(opts.resolveChild(f.childDocType!), opts.resolveChild));
    }
```

- [ ] **Step 8: Export the new module**

In `packages/core/src/index.ts`, add after the first line:

```ts
export * from './collections';
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run packages/core && npm run typecheck`
Expected: PASS. All M1 core tests still pass, including the Select `'Other'` rejection, and the new tests pass.

- [ ] **Step 10: Commit**

```bash
git add packages/core
git commit -m "feat(core): validate DocPerm rows, naming fields and collections; memoise child schemas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Global DocTypes and the `resolveDocAccess` facade

**Files:**
- Modify: `packages/core/src/perm/evaluate.ts` (`DocContext` and `grantApplies`)
- Create: `packages/core/src/perm/access.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/perm/access.test.ts`

**Interfaces:**
- Consumes: `can`, `permittedLevels`, `readableFields`, `patchKeys` (evaluate.ts); `mergeCustomFields`, `fieldKey`; `buildSchema`; `deepEqual`; `SYSTEM_FIELDS`.
- Produces:
  - `DocContext.orgPath: readonly string[] | null`. `null` means a global DocType, and a role held anywhere applies.
  - `getFieldValue(doc: Record<string, unknown> | null, key: string): unknown`. The key is `'name'` or `'custom.name'`; missing values read as `null`.
  - `redactDoc(doc: Record<string, unknown>, readable: readonly FieldDef[]): Record<string, unknown>`
  - `resolveDocAccess(input: DocAccessInput): DocAccess`, where:

```ts
interface DocAccessInput { meta: DocTypeMeta; customFields: readonly FieldDef[]; user: UserContext; doc: DocContext; resolveChild: (name: string) => DocTypeMeta }
interface DocAccess {
  fields: readonly FieldDef[];                // core + custom (isCustom: true)
  canRead: boolean; canWrite: boolean; canCreate: boolean; canDelete: boolean;
  readableFields: readonly FieldDef[];
  schema(mode: 'create' | 'update'): z.ZodType;           // memoised per mode
  unwritableKeys(patch: Record<string, unknown>, before: Record<string, unknown> | null): string[];
}
```

`unwritableKeys` works like this:
- It reports keys (`name`, `custom.name`, or `table.childField`) whose field is readOnly or above the caller's write permlevels, **and** whose value differs from `before`.
- `before === null` means create. On create, every non-null value counts as a change, and a caller with create permission may always fill level-0 fields.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/perm/access.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defineDocType } from '../meta/defineDocType';
import type { FieldDef } from '../meta/types';
import { getFieldValue, redactDoc, resolveDocAccess } from './access';
import { can, type DocContext, type UserContext } from './evaluate';

const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];

const duesRow = defineDocType({
  name: 'DuesRow',
  module: 't',
  isChild: true,
  fields: [
    { fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true },
    { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', permlevel: 1 },
    { fieldname: 'verified', label: 'Verified', fieldtype: 'Check', readOnly: true },
  ],
});
const person = defineDocType({
  name: 'Person',
  module: 't',
  collection: 'persons',
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data', reqd: true },
    { fieldname: 'membershipType', label: 'Type', fieldtype: 'Select', options: ['Probation', 'Official'], permlevel: 1 },
    { fieldname: 'authUid', label: 'Auth UID', fieldtype: 'Data', readOnly: true },
    { fieldname: 'dues', label: 'Dues', fieldtype: 'Table', childDocType: 'DuesRow' },
  ],
  permissions: [
    { role: 'Member', read: true },
    { role: 'Member', write: true, ifOwner: true },
    { role: 'Member', permlevel: 1, read: true },
    { role: 'MembershipOfficer', read: true, write: true, create: true },
    { role: 'MembershipOfficer', permlevel: 1, read: true, write: true },
    { role: 'Treasurer', create: true },
  ],
});
const resolveChild = (name: string) => {
  if (name === 'DuesRow') return duesRow;
  throw new Error(`unexpected child ${name}`);
};

const member: UserContext = { uid: 'u1', personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] };
const officer: UserContext = {
  uid: 'u2',
  personId: 'p2',
  grants: [{ role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true }],
};
const treasurer: UserContext = { uid: 'u3', personId: 'p3', grants: [{ role: 'Treasurer', orgId: 'jci-kl', withDescendants: false }] };
const own: DocContext = { orgPath: KL, ownerPersonId: 'p1' };
const access = (user: UserContext, doc: DocContext = own, customFields: readonly FieldDef[] = []) =>
  resolveDocAccess({ meta: person, customFields, user, doc, resolveChild });

const before = {
  id: 'P1',
  orgId: 'jci-kl',
  orgPath: KL,
  ownerPersonId: 'p1',
  fullName: 'Tan',
  membershipType: 'Probation',
  authUid: 'abc',
  dues: [{ year: 2025, amount: 350, verified: true }],
  custom: { shirtSize: 'M' },
};

describe('global DocTypes', () => {
  it('apply a role held anywhere when orgPath is null', () => {
    const setting = defineDocType({
      name: 'Setting',
      module: 't',
      collection: 'settings',
      orgScoped: false,
      fields: [{ fieldname: 'value', label: 'Value', fieldtype: 'Data' }],
      permissions: [{ role: 'Member', read: true }],
    });
    expect(can(setting, member, 'read', { orgPath: null })).toBe(true);
    expect(can(setting, { uid: 'u9', personId: null, grants: [] }, 'read', { orgPath: null })).toBe(false);
    expect(can(person, member, 'read', { orgPath: [] })).toBe(false);
  });
});

describe('resolveDocAccess', () => {
  it('summarises document-level access', () => {
    const a = access(member);
    expect([a.canRead, a.canWrite, a.canCreate, a.canDelete]).toEqual([true, true, false, false]);
    expect(access(officer).canCreate).toBe(true);
  });

  it('rejects only locked fields whose value changes', () => {
    const a = access(member);
    expect(a.unwritableKeys({ fullName: 'Tan Ah Kow', membershipType: 'Probation', authUid: 'abc' }, before)).toEqual([]);
    expect(a.unwritableKeys({ membershipType: 'Official', authUid: 'xyz' }, before)).toEqual(['membershipType', 'authUid']);
  });

  it('treats every non-null locked value as a change on create', () => {
    const a = access(officer, { orgPath: KL, ownerPersonId: 'p2' });
    expect(a.unwritableKeys({ fullName: 'New', membershipType: 'Official', authUid: null }, null)).toEqual([]);
    expect(a.unwritableKeys({ fullName: 'New', authUid: 'x' }, null)).toEqual(['authUid']);
  });

  it('lets create-only roles fill level-0 fields', () => {
    const a = access(treasurer, { orgPath: KL, ownerPersonId: 'p3' });
    expect(a.canCreate).toBe(true);
    expect(a.unwritableKeys({ fullName: 'New' }, null)).toEqual([]);
    expect(a.unwritableKeys({ fullName: 'New', membershipType: 'Official' }, null)).toEqual(['membershipType']);
  });

  it('checks locked child-table fields row by row', () => {
    const m = access(member);
    const o = access(officer, { orgPath: KL, ownerPersonId: 'p1' });
    expect(m.unwritableKeys({ dues: [{ year: 2025, amount: 350, verified: true }] }, before)).toEqual([]);
    expect(m.unwritableKeys({ dues: [{ year: 2026, amount: 350, verified: true }] }, before)).toEqual([]);
    expect(m.unwritableKeys({ dues: [{ year: 2025, amount: 1, verified: true }] }, before)).toEqual(['dues.amount']);
    expect(o.unwritableKeys({ dues: [{ year: 2025, amount: 1, verified: true }] }, before)).toEqual([]);
    expect(
      o.unwritableKeys({ dues: [{ year: 2025, amount: 350, verified: true }, { year: 2026, verified: true }] }, before),
    ).toEqual(['dues.verified']);
  });

  it('checks custom fields and builds each schema once', () => {
    const customFields: FieldDef[] = [{ fieldname: 'shirtSize', label: 'Shirt', fieldtype: 'Data', permlevel: 1 }];
    const a = access(member, own, customFields);
    expect(a.fields.map((f) => f.fieldname)).toContain('shirtSize');
    expect(a.unwritableKeys({ custom: { shirtSize: 'M' } }, before)).toEqual([]);
    expect(a.unwritableKeys({ custom: { shirtSize: 'L' } }, before)).toEqual(['custom.shirtSize']);
    expect(a.schema('update')).toBe(a.schema('update'));
    expect(a.schema('create').safeParse({ fullName: 'A', custom: { shirtSize: 'L' } }).success).toBe(true);
  });

  it('lists readable fields', () => {
    const outsider: UserContext = { uid: 'u4', personId: null, grants: [{ role: 'Member', orgId: 'jci-pj', withDescendants: false }] };
    expect(access(outsider).readableFields).toEqual([]);
    expect(access(member).readableFields.map((f) => f.fieldname)).toEqual(['fullName', 'membershipType', 'authUid', 'dues']);
  });
});

describe('getFieldValue and redactDoc', () => {
  it('reads core and custom values, defaulting to null', () => {
    expect(getFieldValue(before, 'fullName')).toBe('Tan');
    expect(getFieldValue(before, 'custom.shirtSize')).toBe('M');
    expect(getFieldValue(before, 'custom.missing')).toBeNull();
    expect(getFieldValue(null, 'fullName')).toBeNull();
  });

  it('keeps system fields and readable fields only', () => {
    const readable: FieldDef[] = [
      ...person.fields.filter((f) => f.fieldname === 'fullName'),
      { fieldname: 'shirtSize', label: 'Shirt', fieldtype: 'Data', isCustom: true },
    ];
    expect(redactDoc(before, readable)).toEqual({
      id: 'P1',
      orgId: 'jci-kl',
      orgPath: KL,
      ownerPersonId: 'p1',
      fullName: 'Tan',
      custom: { shirtSize: 'M' },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/src/perm/access.test.ts`
Expected: FAIL with `Failed to resolve import "./access"`.

- [ ] **Step 3: Allow `orgPath: null` in the evaluator**

In `packages/core/src/perm/evaluate.ts`, replace the `DocContext` interface and the `grantApplies` function with:

```ts
export interface DocContext {
  /** Ancestors from the root, ending with the doc's own org; null for a global (orgScoped: false) DocType. */
  orgPath: readonly string[] | null;
  ownerPersonId?: string | null;
}
```

```ts
export function grantApplies(grant: RoleGrant, orgPath: readonly string[] | null): boolean {
  // Global DocTypes have no org: a role held anywhere applies.
  if (orgPath === null) return true;
  if (orgPath.length === 0) return false;
  return grant.withDescendants ? orgPath.includes(grant.orgId) : orgPath[orgPath.length - 1] === grant.orgId;
}
```

- [ ] **Step 4: Write the facade**

Create `packages/core/src/perm/access.ts`:

```ts
import type { z } from 'zod';
import { deepEqual } from '../diff/diffDocs';
import { fieldKey, mergeCustomFields } from '../meta/customFields';
import { SYSTEM_FIELDS, type DocTypeMeta, type FieldDef } from '../meta/types';
import { buildSchema } from '../validate/buildSchema';
import { can, patchKeys, permittedLevels, readableFields, type DocContext, type UserContext } from './evaluate';

export interface DocAccessInput {
  meta: DocTypeMeta;
  /** Custom field definitions that apply to this document (not yet marked isCustom). */
  customFields: readonly FieldDef[];
  user: UserContext;
  doc: DocContext;
  resolveChild: (name: string) => DocTypeMeta;
}

export interface DocAccess {
  /** Core fields followed by custom fields (isCustom: true). */
  fields: readonly FieldDef[];
  canRead: boolean;
  canWrite: boolean;
  canCreate: boolean;
  canDelete: boolean;
  readableFields: readonly FieldDef[];
  schema(mode: 'create' | 'update'): z.ZodType;
  /**
   * Keys of `patch` the caller may not change: readOnly fields and fields above their write permlevels,
   * reported only when the value differs from `before`. Child-table fields are reported as 'table.field'.
   * `before` is the stored document, or null on create.
   */
  unwritableKeys(patch: Record<string, unknown>, before: Record<string, unknown> | null): string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Value at a field key ('name' or 'custom.name'); missing values read as null. */
export function getFieldValue(doc: Record<string, unknown> | null, key: string): unknown {
  if (!doc) return null;
  if (key.startsWith('custom.')) {
    const custom = doc.custom;
    return isRecord(custom) ? (custom[key.slice('custom.'.length)] ?? null) : null;
  }
  return doc[key] ?? null;
}

function isLocked(f: FieldDef, levels: ReadonlySet<number>): boolean {
  return f.readOnly === true || !levels.has(f.permlevel ?? 0);
}

/** Rows are compared by position, so clients must send complete rows in their stored order. */
function lockedChildKeys(
  meta: DocTypeMeta,
  resolveChild: (name: string) => DocTypeMeta,
  levels: ReadonlySet<number>,
  patch: Record<string, unknown>,
  before: Record<string, unknown> | null,
): string[] {
  const out: string[] = [];
  for (const f of meta.fields) {
    const rows = patch[f.fieldname];
    if (f.fieldtype !== 'Table' || !Array.isArray(rows)) continue;
    const beforeValue = before?.[f.fieldname];
    const beforeRows: unknown[] = Array.isArray(beforeValue) ? beforeValue : [];
    for (const cf of resolveChild(f.childDocType!).fields) {
      if (!isLocked(cf, levels)) continue;
      const changed = rows.some((row: unknown, i) => {
        const old: unknown = beforeRows[i];
        const next = isRecord(row) ? (row[cf.fieldname] ?? null) : null;
        const prev = isRecord(old) ? (old[cf.fieldname] ?? null) : null;
        return !deepEqual(next, prev);
      });
      if (changed) out.push(`${f.fieldname}.${cf.fieldname}`);
    }
  }
  return out;
}

export function resolveDocAccess(input: DocAccessInput): DocAccess {
  const { meta, user, doc, resolveChild } = input;
  const fields = mergeCustomFields(meta, input.customFields);
  const byKey = new Map(fields.map((f) => [fieldKey(f), f]));
  const canCreate = can(meta, user, 'create', doc);
  const writeLevels = permittedLevels(meta, user, 'write', doc);
  const schemas = new Map<'create' | 'update', z.ZodType>();

  return {
    fields,
    canRead: can(meta, user, 'read', doc),
    canWrite: can(meta, user, 'write', doc),
    canCreate,
    canDelete: can(meta, user, 'delete', doc),
    readableFields: readableFields(meta, fields, user, doc),
    schema(mode) {
      let s = schemas.get(mode);
      if (!s) {
        s = buildSchema(meta, { customFields: input.customFields, mode, resolveChild });
        schemas.set(mode, s);
      }
      return s;
    },
    unwritableKeys(patch, before) {
      // A creator may always fill level-0 fields, even with create-only permission.
      const levels = before === null && canCreate ? new Set([0, ...writeLevels]) : writeLevels;
      const locked = patchKeys(patch).filter((key) => {
        const f = byKey.get(key);
        return f !== undefined && isLocked(f, levels) && !deepEqual(getFieldValue(patch, key), getFieldValue(before, key));
      });
      return [...locked, ...lockedChildKeys(meta, resolveChild, levels, patch, before)];
    },
  };
}

/** System fields plus the readable fields of `doc`; custom values stay under `custom`. */
export function redactDoc(doc: Record<string, unknown>, readable: readonly FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SYSTEM_FIELDS) if (k in doc) out[k] = doc[k];
  const custom: Record<string, unknown> = {};
  for (const f of readable) {
    if (f.isCustom) {
      const v = getFieldValue(doc, fieldKey(f));
      if (v !== null) custom[f.fieldname] = v;
    } else if (f.fieldname in doc) {
      out[f.fieldname] = doc[f.fieldname];
    }
  }
  if (Object.keys(custom).length > 0) out.custom = custom;
  return out;
}
```

- [ ] **Step 5: Export it**

In `packages/core/src/index.ts`, add after `export * from './perm/evaluate';`:

```ts
export * from './perm/access';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/core && npm run typecheck`
Expected: PASS. This includes the M1 `evaluate.test.ts` suite, where `grantApplies(..., [])` is still false.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): resolveDocAccess facade with change-aware field locks; global DocTypes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: userAccess builder, controller types, custom fields from stored docs

**Files:**
- Modify: `packages/core/src/errors.ts` (add `ValidationError`)
- Create: `packages/core/src/access/userAccess.ts`
- Create: `packages/core/src/controller/types.ts`
- Modify: `packages/core/src/meta/customFields.ts` (add `customFieldFromDoc`)
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/access/userAccess.test.ts`, `packages/core/src/meta/customFields.test.ts`

**Interfaces:**
- Consumes: `ROLES`, `RoleName`, `RoleGrant`, `UserContext`, `DocTypeMeta`, `Registry`, `FieldDef`, `FieldType`.
- Produces:

```ts
class ValidationError extends Error { readonly field?: string }       // controllers throw it; the API maps it to 422
interface RoleScope { exact: string[]; subtree: string[] }
interface UserAccessDoc { uid: string; personId: string | null; grants: RoleGrant[]; scopes: Partial<Record<RoleName, RoleScope>> }
function parseGrant(value: unknown): RoleGrant | null
function buildUserAccess(uid: string, personId: string | null, grants: readonly unknown[]): UserAccessDoc   // sorted, de-duplicated
function userContextFromAccess(data: unknown, uid: string): UserContext                                  // drops malformed grants
type StoredDoc = Record<string, unknown>
interface HookContext {
  readonly meta: DocTypeMeta; readonly registry: Registry; readonly user: UserContext;
  readonly isNew: boolean; readonly id: string; readonly orgPath: readonly string[] | null;
  readonly before: StoredDoc | null; doc: Record<string, unknown>;
  get(doctype: string, id: string): Promise<StoredDoc | null>;
}
interface Controller { validate?(ctx): void | Promise<void>; beforeSave?(ctx): void | Promise<void>; beforeDelete?(ctx): void | Promise<void> }
type ControllerMap = Readonly<Record<string, Controller>>
function customFieldFromDoc(doc: Record<string, unknown>): FieldDef   // options stored one per line
```

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/access/userAccess.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildUserAccess, parseGrant, userContextFromAccess } from './userAccess';

describe('buildUserAccess', () => {
  it('groups grants into per-role scopes, sorted and de-duplicated', () => {
    const access = buildUserAccess('u1', 'p1', [
      { role: 'Member', orgId: 'jci-pj', withDescendants: false },
      { role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true },
      { role: 'Member', orgId: 'jci-kl', withDescendants: false },
      { role: 'Member', orgId: 'jci-kl', withDescendants: false },
      { role: 'Hacker', orgId: 'jci', withDescendants: true },
    ]);
    expect(access).toEqual({
      uid: 'u1',
      personId: 'p1',
      grants: [
        { role: 'Member', orgId: 'jci-kl', withDescendants: false },
        { role: 'Member', orgId: 'jci-pj', withDescendants: false },
        { role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true },
      ],
      scopes: {
        Member: { exact: ['jci-kl', 'jci-pj'], subtree: [] },
        MembershipOfficer: { exact: [], subtree: ['jci-malaysia'] },
      },
    });
  });
});

describe('parseGrant and userContextFromAccess', () => {
  it('accepts only well-formed grants with known roles', () => {
    expect(parseGrant({ role: 'Member', orgId: 'jci-kl' })).toEqual({ role: 'Member', orgId: 'jci-kl', withDescendants: false });
    expect(parseGrant({ role: 'Member', orgId: '' })).toBeNull();
    expect(parseGrant({ role: 'Root', orgId: 'jci' })).toBeNull();
    expect(parseGrant('Member')).toBeNull();
  });

  it('turns a stored doc back into a UserContext', () => {
    expect(userContextFromAccess(null, 'u1')).toEqual({ uid: 'u1', personId: null, grants: [] });
    expect(
      userContextFromAccess(
        { personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }, { role: 'Root', orgId: 'x' }] },
        'u1',
      ),
    ).toEqual({ uid: 'u1', personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] });
  });
});
```

In `packages/core/src/meta/customFields.test.ts`, change the `./customFields` import to `import { customFieldFromDoc, fieldKey, mergeCustomFields, validateCustomField } from './customFields';` and append:

```ts
describe('customFieldFromDoc', () => {
  it('maps a stored CustomField document to a FieldDef', () => {
    expect(
      customFieldFromDoc({
        id: 'Person.shirtSize',
        targetDocType: 'Person',
        fieldname: 'shirtSize',
        label: 'Shirt size',
        fieldtype: 'Select',
        options: 'S\n M \n\nL',
        permlevel: 1,
        reqd: true,
        org: 'jci-kl',
      }),
    ).toEqual({ fieldname: 'shirtSize', label: 'Shirt size', fieldtype: 'Select', options: ['S', 'M', 'L'], permlevel: 1, reqd: true });
    expect(customFieldFromDoc({ fieldname: 'mentor', label: 'Mentor', fieldtype: 'Link', link: 'Person', options: null })).toEqual({
      fieldname: 'mentor',
      label: 'Mentor',
      fieldtype: 'Link',
      link: 'Person',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core`
Expected: FAIL. `./userAccess` cannot be resolved, and `customFieldFromDoc` is not exported.

- [ ] **Step 3: Add `ValidationError`**

Append to `packages/core/src/errors.ts`:

```ts
/** A user-facing rejection thrown by a controller hook. The API maps it to HTTP 422. */
export class ValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

- [ ] **Step 4: Write the userAccess module**

Create `packages/core/src/access/userAccess.ts`:

```ts
import { ROLES, type RoleName } from '../meta/types';
import type { RoleGrant, UserContext } from '../perm/evaluate';

export interface RoleScope {
  /** Orgs where the role applies to that org only. */
  exact: string[];
  /** Orgs whose whole subtree the role covers. */
  subtree: string[];
}

/**
 * Stored at userAccess/{uid}; written only by the server.
 * The API reads `grants`; Firestore rules read `scopes` (orgId in exact || orgPath hasAny subtree).
 */
export interface UserAccessDoc {
  uid: string;
  personId: string | null;
  grants: RoleGrant[];
  scopes: Partial<Record<RoleName, RoleScope>>;
}

/** A RoleGrant when the value is a well-formed grant with a known role, else null. */
export function parseGrant(value: unknown): RoleGrant | null {
  if (value === null || typeof value !== 'object') return null;
  const { role, orgId, withDescendants } = value as Record<string, unknown>;
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) return null;
  if (typeof orgId !== 'string' || orgId === '') return null;
  return { role: role as RoleName, orgId, withDescendants: withDescendants === true };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const compareGrants = (a: RoleGrant, b: RoleGrant): number =>
  cmp(a.role, b.role) || cmp(a.orgId, b.orgId) || Number(a.withDescendants) - Number(b.withDescendants);

export function buildUserAccess(uid: string, personId: string | null, grants: readonly unknown[]): UserAccessDoc {
  const unique = new Map<string, RoleGrant>();
  for (const value of grants) {
    const g = parseGrant(value);
    if (g) unique.set(`${g.role}|${g.orgId}|${g.withDescendants}`, g);
  }
  const sorted = [...unique.values()].sort(compareGrants);
  const scopes: Partial<Record<RoleName, RoleScope>> = {};
  for (const g of sorted) {
    const scope = (scopes[g.role] ??= { exact: [], subtree: [] });
    (g.withDescendants ? scope.subtree : scope.exact).push(g.orgId);
  }
  return { uid, personId, grants: sorted, scopes };
}

export function userContextFromAccess(data: unknown, uid: string): UserContext {
  if (data === null || typeof data !== 'object') return { uid, personId: null, grants: [] };
  const { personId, grants } = data as Record<string, unknown>;
  return {
    uid,
    personId: typeof personId === 'string' ? personId : null,
    grants: Array.isArray(grants) ? grants.map(parseGrant).filter((g): g is RoleGrant => g !== null) : [],
  };
}
```

- [ ] **Step 5: Write the controller types**

Create `packages/core/src/controller/types.ts`:

```ts
import type { Registry } from '../meta/registry';
import type { DocTypeMeta } from '../meta/types';
import type { UserContext } from '../perm/evaluate';

/** A document as stored in Firestore, system fields included. */
export type StoredDoc = Record<string, unknown>;

export interface HookContext {
  readonly meta: DocTypeMeta;
  readonly registry: Registry;
  readonly user: UserContext;
  readonly isNew: boolean;
  readonly id: string;
  /** Org path of the document; null for global (orgScoped: false) DocTypes. */
  readonly orgPath: readonly string[] | null;
  /** The stored document before this change; null on create. */
  readonly before: StoredDoc | null;
  /** The fields being saved, without system fields. beforeSave may change them. On delete: the old fields. */
  doc: Record<string, unknown>;
  /** Reads another document inside the same transaction. */
  get(doctype: string, id: string): Promise<StoredDoc | null>;
}

/**
 * Pure DocType logic, shared by client and server. Throw ValidationError to reject a change.
 * Post-commit side effects are server-only (netlify/functions/_shared/effects.ts).
 */
export interface Controller {
  validate?(ctx: HookContext): void | Promise<void>;
  beforeSave?(ctx: HookContext): void | Promise<void>;
  beforeDelete?(ctx: HookContext): void | Promise<void>;
}

export type ControllerMap = Readonly<Record<string, Controller>>;
```

- [ ] **Step 6: Add `customFieldFromDoc`**

In `packages/core/src/meta/customFields.ts`:
- Change the type import to `import type { DocTypeMeta, FieldDef, FieldType } from './types';`.
- Append:

```ts
/** Converts a stored CustomField document into a FieldDef. Options are stored one per line. */
export function customFieldFromDoc(doc: Record<string, unknown>): FieldDef {
  const options =
    typeof doc.options === 'string'
      ? doc.options
          .split('\n')
          .map((o) => o.trim())
          .filter((o) => o !== '')
      : [];
  return {
    fieldname: String(doc.fieldname),
    label: String(doc.label),
    fieldtype: doc.fieldtype as FieldType,
    ...(options.length > 0 ? { options } : {}),
    ...(typeof doc.link === 'string' && doc.link !== '' ? { link: doc.link } : {}),
    ...(typeof doc.permlevel === 'number' ? { permlevel: doc.permlevel } : {}),
    ...(doc.reqd === true ? { reqd: true } : {}),
  };
}
```

`validateCustomField` still validates the result wherever it is merged, so a bad stored row cannot slip through.

- [ ] **Step 7: Export the new modules**

Append to `packages/core/src/index.ts`:

```ts
export * from './access/userAccess';
export * from './controller/types';
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run packages/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core
git commit -m "feat(core): userAccess builder, controller hook types and customFieldFromDoc

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Firestore rules generator

**Files:**
- Create: `packages/core/src/rules/generateRules.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/rules/generateRules.test.ts`

**Interfaces:**
- Consumes: `USER_ACCESS_COLLECTION`, `VERSIONS_COLLECTION`, `DocTypeMeta` (`permissions`, `orgScoped`, `isChild`, `trackChanges`, `collection`).
- Produces: `generateFirestoreRules(metas: readonly DocTypeMeta[]): string`. The output is deterministic regardless of input order. The rules work like this:
  - `userAccess/{uid}` is readable by its owner only.
  - Each DocType collection is readable when a level-0 `read` row matches:
    - org-scoped DocTypes use `hasRole(role, doc)`
    - global DocTypes use `hasRoleAnywhere(role)`
    - `ifOwner` rows add `isOwner(doc)`
  - `versions/{id}` is readable with the same condition as the document's DocType, for tracked DocTypes only.
  - Every client write is denied.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/rules/generateRules.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/src/rules`
Expected: FAIL with `Failed to resolve import "./generateRules"`.

- [ ] **Step 3: Write the generator**

Create `packages/core/src/rules/generateRules.ts`:

```ts
import { USER_ACCESS_COLLECTION, VERSIONS_COLLECTION } from '../collections';
import type { DocTypeMeta } from '../meta/types';

const HEADER = `rules_version = '2';

// GENERATED by \`npm run gen:rules\` from the DocType registry. Do not edit by hand.
// Reads are scoped by org through userAccess/{uid}. Every client write is denied:
// all writes go through the /api/resource save pipeline.
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function access() {
      return get(/databases/$(database)/documents/${USER_ACCESS_COLLECTION}/$(request.auth.uid)).data;
    }

    function hasRole(role, d) {
      let scopes = access().scopes;
      return role in scopes && (d.orgId in scopes[role].exact || d.orgPath.hasAny(scopes[role].subtree));
    }

    function hasRoleAnywhere(role) {
      return role in access().scopes;
    }

    function isOwner(d) {
      let personId = access().personId;
      return personId != null && d.ownerPersonId == personId;
    }

    match /${USER_ACCESS_COLLECTION}/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
      allow write: if false;
    }
`;

/** Level-0 read rows of `meta` as a rules expression over the document `d`. */
function readCondition(meta: DocTypeMeta, d: string): string {
  const parts: string[] = [];
  for (const p of meta.permissions) {
    if ((p.permlevel ?? 0) !== 0 || p.read !== true) continue;
    const role = meta.orgScoped ? `hasRole('${p.role}', ${d})` : `hasRoleAnywhere('${p.role}')`;
    const part = p.ifOwner ? `(${role} && isOwner(${d}))` : role;
    if (!parts.includes(part)) parts.push(part);
  }
  return parts.length === 0 ? 'false' : parts.join(' || ');
}

function block(collection: string, condition: string): string {
  return [
    `    match /${collection}/{id} {`,
    `      allow read: if signedIn() && (${condition});`,
    '      allow write: if false;',
    '    }',
    '',
  ].join('\n');
}

/** Firestore rules for the registry. Role names and collection names are validated by defineDocType. */
export function generateFirestoreRules(metas: readonly DocTypeMeta[]): string {
  const docTypes = metas.filter((m) => !m.isChild).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const blocks = docTypes.map((m) => block(m.collection, readCondition(m, 'resource.data')));
  const versioned = docTypes
    .filter((m) => m.trackChanges)
    .map((m) => `(resource.data.doctype == '${m.name}' && (${readCondition(m, 'resource.data')}))`);
  blocks.push(block(VERSIONS_COLLECTION, versioned.length > 0 ? versioned.join('\n        || ') : 'false'));
  return `${HEADER}\n${blocks.join('\n')}  }\n}\n`;
}
```

- [ ] **Step 4: Export it**

Append to `packages/core/src/index.ts`:

```ts
export * from './rules/generateRules';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): generate Firestore rules from DocType permissions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `@jci/doctypes`: Organization, RoleAssignment, CustomField, and the generated rules file

**Files:**
- Create: `packages/doctypes/package.json`, `packages/doctypes/tsconfig.json`
- Create: `packages/doctypes/src/index.ts`
- Create: `packages/doctypes/src/core/organization.ts`, `roleAssignment.ts`, `customField.ts`, `seed.ts`, `testContext.ts`
- Create: `scripts/gen-rules.mts`
- Create: `firestore.rules` (generated)
- Modify: `package.json` (devDeps, scripts), `vitest.config.ts` (include)
- Test: `packages/doctypes/src/core/organization.test.ts`, `roleAssignment.test.ts`, `customField.test.ts`, `packages/doctypes/src/index.test.ts`, `packages/doctypes/src/rules.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 to 5, plus `canBeChildOf`, `buildOrgPath`, `grantApplies`, `effectiveRoles`, `validateCustomField`, `ORG_LEVELS`, `FIELD_TYPES`.
- Produces (all exported from `@jci/doctypes`):
  - `Organization`, `RoleAssignment`, `CustomField` (DocTypeMeta)
  - `organizationController`, `roleAssignmentController`, `customFieldController`
  - `DOCTYPES` (readonly array of the three)
  - `registry: Registry`, `controllers: ControllerMap`
  - `CUSTOM_FIELD_TYPES`
  - `SeedOrg { code; title; level: OrgLevel; parent: string | null }`, `SEED_ORGS`
  - `orgDocs(orgs: readonly SeedOrg[]): Record<string, unknown>[]`. It returns stored Organization docs with `id, code, title, level, parent, orgId, orgPath`, and the input must list parents first.
- Collection names: `organizations`, `roleAssignments`, `customFields`.
- Stored field names used by the server:
  - RoleAssignment: `uid`, `role`, `withDescendants`
  - CustomField: `targetDocType`, `fieldname`, `label`, `fieldtype`, `org`, `options`, `link`, `permlevel`, `reqd`

- [ ] **Step 1: Install script dependencies**

```bash
npm install -D tsx@^4.23.0 @types/node@^22
```

- [ ] **Step 2: Create the package**

Create `packages/doctypes/package.json`:

```json
{
  "name": "@jci/doctypes",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@jci/core": "*"
  }
}
```

Create `packages/doctypes/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Run `npm install` so the workspace links `@jci/doctypes` into `node_modules`.

- [ ] **Step 3: Write the failing controller tests**

Create `packages/doctypes/src/core/testContext.ts`. It holds test helpers only and is not exported from the package:

```ts
import { createRegistry, type DocTypeMeta, type HookContext, type RoleName, type StoredDoc, type UserContext } from '@jci/core';
import { CustomField } from './customField';
import { Organization } from './organization';
import { RoleAssignment } from './roleAssignment';
import { orgDocs, SEED_ORGS } from './seed';

/** Test-only helpers for controller unit tests. Not exported from the package. */
export const registry = createRegistry([Organization, RoleAssignment, CustomField]);
export const KL_PATH = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];
export const PJ_PATH = [...KL_PATH.slice(0, 4), 'jci-pj'];

const store: Record<string, StoredDoc> = Object.fromEntries(
  orgDocs([...SEED_ORGS, { code: 'jci-pj', title: 'JCI Petaling Jaya', level: 'local', parent: 'jci-malaysia-central' }]).map(
    (o) => [`Organization/${String(o.id)}`, o],
  ),
);

export function userWith(...grants: [RoleName, string, boolean][]): UserContext {
  return { uid: 'u-test', personId: null, grants: grants.map(([role, orgId, withDescendants]) => ({ role, orgId, withDescendants })) };
}

export const systemManager = userWith(['SystemManager', 'jci', true]);

export function hookContext(
  meta: DocTypeMeta,
  doc: Record<string, unknown>,
  extra: Partial<Omit<HookContext, 'meta' | 'doc'>> = {},
): HookContext {
  return {
    meta,
    registry,
    user: systemManager,
    isNew: true,
    id: 'test-id',
    orgPath: null,
    before: null,
    doc,
    get: async (doctype, id) => store[`${doctype}/${id}`] ?? null,
    ...extra,
  };
}
```

Create `packages/doctypes/src/core/organization.test.ts`:

```ts
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
```

Create `packages/doctypes/src/core/roleAssignment.test.ts`:

```ts
import type { HookContext } from '@jci/core';
import { describe, expect, it } from 'vitest';
import { RoleAssignment, roleAssignmentController } from './roleAssignment';
import { hookContext, PJ_PATH, systemManager, userWith } from './testContext';

const pjAdmin = userWith(['OrgAdmin', 'jci-pj', false]);
const nationalAdmin = userWith(['OrgAdmin', 'jci-malaysia', true]);
const at = (user = pjAdmin, extra: Partial<HookContext> = {}) => ({ user, orgPath: PJ_PATH, ...extra });
const validate = async (doc: Record<string, unknown>, extra: Partial<HookContext>) =>
  roleAssignmentController.validate!(hookContext(RoleAssignment, doc, extra));
const beforeDelete = async (before: Record<string, unknown>, extra: Partial<HookContext>) =>
  roleAssignmentController.beforeDelete!(hookContext(RoleAssignment, before, { ...extra, isNew: false, before }));

describe('RoleAssignment', () => {
  it('lets an org admin grant ordinary roles at their org', async () => {
    await expect(validate({ uid: 'x', role: 'Member' }, at())).resolves.toBeUndefined();
  });

  it('reserves the System Manager role for System Managers', async () => {
    await expect(validate({ uid: 'x', role: 'SystemManager' }, at())).rejects.toMatchObject({ field: 'role' });
    await expect(
      validate({ uid: 'x', role: 'Member' }, at(pjAdmin, { isNew: false, before: { uid: 'x', role: 'SystemManager' } })),
    ).rejects.toMatchObject({ field: 'role' });
    await expect(validate({ uid: 'x', role: 'SystemManager', withDescendants: true }, at(systemManager))).resolves.toBeUndefined();
  });

  it('allows subtree grants only from admins who cover the subtree', async () => {
    await expect(validate({ uid: 'x', role: 'Member', withDescendants: true }, at())).rejects.toMatchObject({ field: 'withDescendants' });
    await expect(validate({ uid: 'x', role: 'Member', withDescendants: true }, at(nationalAdmin))).resolves.toBeUndefined();
  });

  it('stops non-System-Managers removing a System Manager', async () => {
    await expect(beforeDelete({ uid: 'x', role: 'SystemManager' }, at())).rejects.toMatchObject({ field: 'role' });
    await expect(beforeDelete({ uid: 'x', role: 'Member' }, at())).resolves.toBeUndefined();
  });
});
```

Create `packages/doctypes/src/core/customField.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they fail**

Add the doctypes tests to the unit run. In `vitest.config.ts`, change `include` to:

```ts
    include: ['packages/core/src/**/*.test.ts', 'packages/doctypes/src/**/*.test.ts', 'tools/**/*.test.mjs'],
```

Run: `npx vitest run packages/doctypes`
Expected: FAIL. `./organization`, `./seed` and the other modules cannot be resolved.

- [ ] **Step 5: Write the seed data**

Create `packages/doctypes/src/core/seed.ts`:

```ts
import { buildOrgPath, type OrgLevel } from '@jci/core';

export interface SeedOrg {
  code: string;
  title: string;
  level: OrgLevel;
  parent: string | null;
}

/** The org tree for the first launch (spec: Phase 1 DocTypes → Organization). Parents come first. */
export const SEED_ORGS: readonly SeedOrg[] = [
  { code: 'jci', title: 'JCI', level: 'hq', parent: null },
  { code: 'jci-asia-pacific', title: 'JCI Asia Pacific', level: 'area', parent: 'jci' },
  { code: 'jci-malaysia', title: 'JCI Malaysia', level: 'national', parent: 'jci-asia-pacific' },
  { code: 'jci-malaysia-central', title: 'JCI Malaysia Area Central', level: 'national_area', parent: 'jci-malaysia' },
  { code: 'jci-kl', title: 'JCI Kuala Lumpur', level: 'local', parent: 'jci-malaysia-central' },
];

/** Stored Organization documents for a parent-first list of orgs. */
export function orgDocs(orgs: readonly SeedOrg[]): Record<string, unknown>[] {
  const paths = new Map<string, string[]>();
  return orgs.map((o) => {
    const parentPath = o.parent === null ? null : paths.get(o.parent);
    if (parentPath === undefined) throw new Error(`Parent "${o.parent}" must come before "${o.code}"`);
    const orgPath = buildOrgPath(parentPath, o.code);
    paths.set(o.code, orgPath);
    return { id: o.code, code: o.code, title: o.title, level: o.level, parent: o.parent, orgId: o.code, orgPath };
  });
}
```

- [ ] **Step 6: Write the Organization DocType**

Create `packages/doctypes/src/core/organization.ts`:

```ts
import { canBeChildOf, defineDocType, ORG_LEVELS, ORGANIZATION_DOCTYPE, ValidationError, type Controller, type OrgLevel } from '@jci/core';

export const Organization = defineDocType({
  name: ORGANIZATION_DOCTYPE,
  module: 'core',
  collection: 'organizations',
  naming: { kind: 'field', field: 'code' },
  titleField: 'title',
  listFields: ['title', 'level'],
  searchFields: ['title', 'code'],
  fields: [
    { fieldname: 'code', label: 'Code', fieldtype: 'Data', reqd: true },
    { fieldname: 'title', label: 'Name', fieldtype: 'Data', reqd: true },
    { fieldname: 'level', label: 'Level', fieldtype: 'Select', options: ORG_LEVELS, reqd: true },
    // Set by the save pipeline from the create request's orgId.
    { fieldname: 'parent', label: 'Parent', fieldtype: 'Link', link: ORGANIZATION_DOCTYPE, readOnly: true },
    { fieldname: 'currency', label: 'Currency', fieldtype: 'Data' },
    { fieldname: 'timezone', label: 'Time zone', fieldtype: 'Data' },
  ],
  permissions: [
    { role: 'SystemManager', read: true, write: true, create: true, delete: true },
    { role: 'OrgAdmin', read: true, write: true, create: true },
    { role: 'MembershipOfficer', read: true },
    { role: 'Treasurer', read: true },
    { role: 'BoardMember', read: true },
    { role: 'Member', read: true },
  ],
});

const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const organizationController: Controller = {
  async validate(ctx) {
    if (!ctx.isNew) {
      if (ctx.doc.code !== ctx.before?.code) throw new ValidationError('The code cannot change', 'code');
      if (ctx.doc.level !== ctx.before?.level) throw new ValidationError('The level cannot change', 'level');
      return;
    }
    if (!CODE.test(String(ctx.doc.code))) {
      throw new ValidationError('Use lowercase letters and digits, separated by single hyphens', 'code');
    }
    const level = ctx.doc.level as OrgLevel;
    const parent = typeof ctx.doc.parent === 'string' ? await ctx.get(ORGANIZATION_DOCTYPE, ctx.doc.parent) : null;
    const parentLevel = (parent?.level as OrgLevel | undefined) ?? null;
    if (!canBeChildOf(level, parentLevel)) {
      throw new ValidationError(
        parentLevel ? `A ${level} organisation cannot sit under a ${parentLevel}` : `A ${level} organisation needs a parent`,
        'level',
      );
    }
  },
};
```

- [ ] **Step 7: Write the RoleAssignment DocType**

Create `packages/doctypes/src/core/roleAssignment.ts`:

```ts
import { defineDocType, grantApplies, ROLE_ASSIGNMENT_DOCTYPE, ROLES, ValidationError, type Controller, type HookContext } from '@jci/core';

/** Grants `role` to the user `uid` at the document's org (orgId), and below it when withDescendants. */
export const RoleAssignment = defineDocType({
  name: ROLE_ASSIGNMENT_DOCTYPE,
  module: 'core',
  collection: 'roleAssignments',
  titleField: 'role',
  listFields: ['uid', 'role', 'withDescendants'],
  searchFields: ['uid'],
  fields: [
    { fieldname: 'uid', label: 'User ID', fieldtype: 'Data', reqd: true },
    { fieldname: 'role', label: 'Role', fieldtype: 'Select', options: ROLES, reqd: true },
    { fieldname: 'withDescendants', label: 'Includes child organisations', fieldtype: 'Check' },
  ],
  permissions: [
    { role: 'SystemManager', read: true, write: true, create: true, delete: true },
    { role: 'OrgAdmin', read: true, write: true, create: true, delete: true },
  ],
});

const isSystemManager = (ctx: HookContext): boolean => ctx.user.grants.some((g) => g.role === 'SystemManager');

export const roleAssignmentController: Controller = {
  validate(ctx) {
    const touchesSystemManager = ctx.doc.role === 'SystemManager' || ctx.before?.role === 'SystemManager';
    if (touchesSystemManager && !isSystemManager(ctx)) {
      throw new ValidationError('Only a System Manager can grant or change the System Manager role', 'role');
    }
    if (ctx.doc.withDescendants === true && !isSystemManager(ctx)) {
      const covers = ctx.user.grants.some((g) => g.role === 'OrgAdmin' && g.withDescendants && grantApplies(g, ctx.orgPath));
      if (!covers) {
        throw new ValidationError('You can only grant a role over child organisations that you administer', 'withDescendants');
      }
    }
  },
  beforeDelete(ctx) {
    if (ctx.before?.role === 'SystemManager' && !isSystemManager(ctx)) {
      throw new ValidationError('Only a System Manager can remove the System Manager role', 'role');
    }
  },
};
```

- [ ] **Step 8: Write the CustomField DocType**

Create `packages/doctypes/src/core/customField.ts`:

```ts
import {
  CUSTOM_FIELD_DOCTYPE,
  customFieldFromDoc,
  defineDocType,
  effectiveRoles,
  FIELD_TYPES,
  MetaError,
  ORGANIZATION_DOCTYPE,
  validateCustomField,
  ValidationError,
  type Controller,
  type HookContext,
} from '@jci/core';

export const CUSTOM_FIELD_TYPES = FIELD_TYPES.filter((t) => t !== 'Table');

/**
 * A field an admin adds to a DocType for their org and every org below it.
 * Global, so every role holder can read definitions made at ancestor orgs; the controller checks the author.
 */
export const CustomField = defineDocType({
  name: CUSTOM_FIELD_DOCTYPE,
  module: 'core',
  collection: 'customFields',
  orgScoped: false,
  naming: { kind: 'fields', fields: ['targetDocType', 'fieldname'] },
  titleField: 'label',
  listFields: ['targetDocType', 'fieldname', 'fieldtype', 'org'],
  searchFields: ['label', 'fieldname'],
  fields: [
    { fieldname: 'targetDocType', label: 'DocType', fieldtype: 'Data', reqd: true },
    { fieldname: 'fieldname', label: 'Field name', fieldtype: 'Data', reqd: true },
    { fieldname: 'label', label: 'Label', fieldtype: 'Data', reqd: true },
    { fieldname: 'fieldtype', label: 'Type', fieldtype: 'Select', options: CUSTOM_FIELD_TYPES, reqd: true },
    { fieldname: 'org', label: 'Organisation', fieldtype: 'Link', link: ORGANIZATION_DOCTYPE, reqd: true },
    { fieldname: 'options', label: 'Options (one per line)', fieldtype: 'Text' },
    { fieldname: 'link', label: 'Links to', fieldtype: 'Data' },
    { fieldname: 'permlevel', label: 'Permission level', fieldtype: 'Int' },
    { fieldname: 'reqd', label: 'Required', fieldtype: 'Check' },
  ],
  permissions: [
    { role: 'SystemManager', read: true, write: true, create: true, delete: true },
    { role: 'OrgAdmin', read: true, write: true, create: true, delete: true },
    { role: 'MembershipOfficer', read: true },
    { role: 'Treasurer', read: true },
    { role: 'BoardMember', read: true },
    { role: 'Member', read: true },
  ],
});

const FIXED_AFTER_CREATE = ['targetDocType', 'fieldname', 'fieldtype', 'org'] as const;

async function assertAdministers(ctx: HookContext, orgId: unknown, targetIsOrgScoped: boolean): Promise<void> {
  const org = typeof orgId === 'string' ? await ctx.get(ORGANIZATION_DOCTYPE, orgId) : null;
  if (!org || !Array.isArray(org.orgPath)) throw new ValidationError('Unknown organisation', 'org');
  const roles = effectiveRoles(ctx.user, { orgPath: org.orgPath as string[] });
  if (roles.has('SystemManager')) return;
  if (targetIsOrgScoped && roles.has('OrgAdmin')) return;
  throw new ValidationError(
    targetIsOrgScoped ? 'You must administer this organisation' : 'Only a System Manager can add fields to this DocType',
    'org',
  );
}

export const customFieldController: Controller = {
  async validate(ctx) {
    const target = String(ctx.doc.targetDocType);
    if (!ctx.registry.has(target) || ctx.registry.get(target).isChild) {
      throw new ValidationError(`Unknown DocType "${target}"`, 'targetDocType');
    }
    const meta = ctx.registry.get(target);
    const field = customFieldFromDoc(ctx.doc);
    try {
      validateCustomField(meta, field);
    } catch (err) {
      if (err instanceof MetaError) throw new ValidationError(err.message);
      throw err;
    }
    if (field.fieldtype === 'Link' && !ctx.registry.has(field.link!)) {
      throw new ValidationError(`Unknown DocType "${field.link}"`, 'link');
    }
    if (!ctx.isNew) {
      for (const key of FIXED_AFTER_CREATE) {
        if (ctx.doc[key] !== ctx.before?.[key]) throw new ValidationError('This cannot change after the field is created', key);
      }
    }
    await assertAdministers(ctx, ctx.doc.org, meta.orgScoped);
  },
  async beforeDelete(ctx) {
    const target = String(ctx.before?.targetDocType);
    const orgScoped = ctx.registry.has(target) ? ctx.registry.get(target).orgScoped : true;
    await assertAdministers(ctx, ctx.before?.org, orgScoped);
  },
};
```

- [ ] **Step 9: Write the package entry**

Create `packages/doctypes/src/index.ts`:

```ts
import { createRegistry, type ControllerMap } from '@jci/core';
import { CustomField, customFieldController } from './core/customField';
import { Organization, organizationController } from './core/organization';
import { RoleAssignment, roleAssignmentController } from './core/roleAssignment';

export * from './core/customField';
export * from './core/organization';
export * from './core/roleAssignment';
export * from './core/seed';

/** Every DocType in the platform. M4 appends the membership module. */
export const DOCTYPES = [Organization, RoleAssignment, CustomField] as const;
export const registry = createRegistry(DOCTYPES);
export const controllers: ControllerMap = {
  [Organization.name]: organizationController,
  [RoleAssignment.name]: roleAssignmentController,
  [CustomField.name]: customFieldController,
};
```

- [ ] **Step 10: Run the controller tests to verify they pass**

Run: `npx vitest run packages/doctypes`
Expected: PASS for `organization`, `roleAssignment` and `customField`.

- [ ] **Step 11: Write the registry and rules drift tests**

Create `packages/doctypes/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { controllers, registry } from './index';

describe('@jci/doctypes', () => {
  it('registers the core DocTypes, each with a controller', () => {
    expect(registry.all().map((m) => m.name)).toEqual(['Organization', 'RoleAssignment', 'CustomField']);
    for (const m of registry.all()) expect(controllers[m.name], m.name).toBeDefined();
  });
});
```

Create `packages/doctypes/src/rules.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { generateFirestoreRules } from '@jci/core';
import { describe, expect, it } from 'vitest';
import { registry } from './index';

describe('firestore.rules', () => {
  it('matches the rules generated from the registry (run `npm run gen:rules` after changing DocTypes)', () => {
    const committed = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(generateFirestoreRules(registry.all()));
  });
});
```

Run: `npx vitest run packages/doctypes/src/rules.test.ts`
Expected: FAIL with `ENOENT: no such file or directory` for `firestore.rules`.

- [ ] **Step 12: Add the generator script and generate the rules**

Create `scripts/gen-rules.mts`:

```ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateFirestoreRules } from '@jci/core';
import { registry } from '@jci/doctypes';

const target = fileURLToPath(new URL('../firestore.rules', import.meta.url));
writeFileSync(target, generateFirestoreRules(registry.all()));
console.log(`Wrote ${target}`);
```

In the root `package.json`:
- Add `"gen:rules": "tsx scripts/gen-rules.mts"` to `scripts`.
- Change `typecheck` to:

```json
"typecheck": "tsc -p packages/core --noEmit && tsc -p packages/doctypes --noEmit && tsc -p packages/ui --noEmit && tsc -p apps/app --noEmit",
```

Run: `npm run gen:rules`
Expected:
- The command prints `Wrote ...firestore.rules`.
- The file starts with `rules_version = '2';`.
- It contains `match /customFields/{id}`, whose condition uses `hasRoleAnywhere(...)` because CustomField is global.
- It contains `match /organizations/{id}` and `match /roleAssignments/{id}`, both using `hasRole(...)`.
- It ends with a `match /versions/{id}` block with one clause per DocType.

- [ ] **Step 13: Run everything**

Run: `npm run check`
Expected: PASS. The drift test now passes, and lint covers `packages/doctypes`.

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json vitest.config.ts packages/doctypes scripts/gen-rules.mts firestore.rules
git commit -m "feat(doctypes): Organization, RoleAssignment and CustomField with controllers; generated rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Emulator and functions workspace

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.indexes.json`, `tsconfig.server.json`
- Create: `netlify/package.json`
- Create: `netlify/functions/_shared/admin.ts`, `netlify/functions/_shared/errors.ts`
- Create: `tests/emulator/helpers.ts`, `tests/emulator/smoke.test.ts`
- Modify: `package.json` (workspace, devDeps, scripts), `vitest.config.ts` (full replacement), `.gitignore`

**Interfaces:**
- Consumes: `firestore.rules` from Task 6.
- Produces:
  - `firestoreFor(app: App): Firestore`. It returns the app's Firestore with `ignoreUndefinedProperties` set exactly once.
  - `serverApp(): App`. It returns the default app, which uses the emulators when `FIRESTORE_EMULATOR_HOST` is set and otherwise requires `FIREBASE_SERVICE_ACCOUNT`.
  - `class ApiError extends Error { status: number; code: string; details?: unknown }`
  - `interface Issue { path: string; message: string }`
  - `invalid(issues: Issue[], message = 'Validation failed'): ApiError`, which is a 422 with code `invalid`.
  - Test helpers:
    - `requireEmulators(): { firestoreHost; authHost }`
    - `testProject(projectId): { projectId; app; db; clear(); close() }`
    - `clearAuth(projectId)`
    - `signUp(email): Promise<{ uid; idToken }>`, which creates the user in the Auth emulator's default project `demo-jci`.
  - Scripts:
    - `npm run test:node` runs unit tests only.
    - `npm run test:emulator` starts the Auth and Firestore emulators and runs `tests/emulator/**`.
    - `npm run emulators` starts them for manual use.

- [ ] **Step 1: Check Java**

Run: `java -version`
Expected: `openjdk version "21...` or newer.

If the command is not found, or reports a version below 21, **stop and ask the user** to install JDK 21 and reopen the terminal. For example:

```bash
winget install EclipseAdoptium.Temurin.21.JDK
```

The Android Studio JBR on this machine is broken (`could not open jvm.cfg`), so it cannot be used.

- [ ] **Step 2: Add the Firebase config**

Create `firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": false },
    "singleProjectMode": false
  }
}
```

`singleProjectMode: false` lets each test file use its own `demo-jci-*` project id.

Create `.firebaserc`:

```json
{
  "projects": {
    "default": "demo-jci"
  }
}
```

Create `firestore.indexes.json`:

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

Append to `.gitignore`:

```
firebase-debug.log
firestore-debug.log
ui-debug.log
.netlify/
```

- [ ] **Step 3: Add the functions workspace**

Create `netlify/package.json`:

```json
{
  "name": "@jci/functions",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@jci/core": "*",
    "@jci/doctypes": "*"
  }
}
```

In the root `package.json`, change `workspaces` to `["apps/*", "packages/*", "netlify"]`. Then install:

```bash
npm install
npm install -w @jci/functions firebase-admin@^14.5.0
npm install -w @jci/functions -D @netlify/functions@^6.0.0
npm install -D firebase-tools@^15.32.0 @firebase/rules-unit-testing@^5.0.2 firebase@^12.19.0
```

- [ ] **Step 4: Scripts, vitest projects and server typecheck**

In the root `package.json` `scripts`:
- Change `test:node` to `"vitest run --project unit"`.
- Add:

```json
"test:emulator": "firebase emulators:exec --only auth,firestore \"vitest run --project emulator\"",
"emulators": "firebase emulators:start --only auth,firestore",
```

- Append ` && tsc -p tsconfig.server.json --noEmit` to the end of `typecheck`.

Replace `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/core/src/**/*.test.ts', 'packages/doctypes/src/**/*.test.ts', 'tools/**/*.test.mjs'],
        },
      },
      {
        // Needs the Firebase emulators: run through `npm run test:emulator`.
        test: {
          name: 'emulator',
          include: ['tests/emulator/**/*.test.ts'],
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
```

Create `tsconfig.server.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "types": ["node"]
  },
  "include": ["netlify/functions/**/*.ts", "tests/emulator/**/*.ts", "scripts/**/*.mts"]
}
```

- [ ] **Step 5: Write the failing smoke test**

Create `tests/emulator/smoke.test.ts`:

```ts
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
```

Run: `npm run test:emulator`
Expected: FAIL with `Failed to resolve import "./helpers"`. The emulators start and shut down around the run; the first run downloads the emulator jars.

- [ ] **Step 6: Write the Firebase Admin setup and errors**

Create `netlify/functions/_shared/errors.ts`:

```ts
/** An error the API reports to the caller as `{ error: { code, message, details } }` with `status`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Issue {
  path: string;
  message: string;
}

export function invalid(issues: Issue[], message = 'Validation failed'): ApiError {
  return new ApiError(422, 'invalid', message, { issues });
}
```

Create `netlify/functions/_shared/admin.ts`:

```ts
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const configured = new WeakSet<Firestore>();

/** The app's Firestore, with undefined properties ignored (settings may only be applied once per instance). */
export function firestoreFor(app: App): Firestore {
  const db = getFirestore(app);
  if (!configured.has(db)) {
    db.settings({ ignoreUndefinedProperties: true });
    configured.add(db);
  }
  return db;
}

/**
 * The server's default Firebase app. With FIRESTORE_EMULATOR_HOST set it talks to the emulators
 * (project FIREBASE_PROJECT_ID, default demo-jci); otherwise FIREBASE_SERVICE_ACCOUNT must hold the key JSON.
 */
export function serverApp(): App {
  const existing = getApps().find((a) => a.name === '[DEFAULT]');
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-jci';
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId });
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  return initializeApp({ credential: cert(JSON.parse(serviceAccount)), projectId });
}
```

- [ ] **Step 7: Write the test helpers**

Create `tests/emulator/helpers.ts`:

```ts
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import { firestoreFor } from '../../netlify/functions/_shared/admin';

export function requireEmulators(): { firestoreHost: string; authHost: string } {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!firestoreHost || !authHost) {
    throw new Error('These tests need the Firebase emulators. Run them with `npm run test:emulator`.');
  }
  return { firestoreHost, authHost };
}

export interface TestProject {
  projectId: string;
  app: App;
  db: Firestore;
  /** Deletes every Firestore document in this project. */
  clear(): Promise<void>;
  close(): Promise<void>;
}

/** An isolated emulator project. Each test file uses its own projectId, so files can run in parallel. */
export function testProject(projectId: string): TestProject {
  const { firestoreHost } = requireEmulators();
  const app = initializeApp({ projectId }, projectId);
  return {
    projectId,
    app,
    db: firestoreFor(app),
    async clear() {
      const url = `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Clearing Firestore for ${projectId} failed: HTTP ${res.status}`);
    },
    close: () => deleteApp(app),
  };
}

export async function clearAuth(projectId: string): Promise<void> {
  const { authHost } = requireEmulators();
  const res = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Clearing Auth for ${projectId} failed: HTTP ${res.status}`);
}

/** Creates a user in the Auth emulator's default project (demo-jci) and returns its ID token. */
export async function signUp(email: string): Promise<{ uid: string; idToken: string }> {
  const { authHost } = requireEmulators();
  const res = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'emulator-only-password', returnSecureToken: true }),
  });
  const body = (await res.json()) as { localId?: string; idToken?: string; error?: { message: string } };
  if (!res.ok || !body.localId || !body.idToken) {
    throw new Error(`Auth emulator sign-up failed: ${body.error?.message ?? res.status}`);
  }
  return { uid: body.localId, idToken: body.idToken };
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test:emulator`
Expected: PASS (2 tests).

Run: `npm run check`
Expected: PASS. Unit tests only; `tsconfig.server.json` typechecks the new files.

- [ ] **Step 9: Commit**

```bash
git add .gitignore package.json package-lock.json vitest.config.ts tsconfig.server.json firebase.json .firebaserc firestore.indexes.json netlify tests
git commit -m "chore(server): Firebase emulators, functions workspace and emulator test harness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Naming and storage helpers

**Files:**
- Create: `netlify/functions/_shared/naming.ts`, `netlify/functions/_shared/store.ts`
- Create: `tests/emulator/fixtures.ts`
- Test: `tests/emulator/store.test.ts`

**Interfaces:**
- Consumes: `seriesPrefix`, `formatSeriesName`, `SERIES_COLLECTION`, `customFieldFromDoc`, `ORGANIZATION_DOCTYPE`, `CUSTOM_FIELD_DOCTYPE`; `invalid` (Task 7); `DOCTYPES`, `orgDocs`, `SEED_ORGS` (Task 6).
- Produces:

```ts
type PendingWrite = (tx: Transaction) => void
function isValidDocId(id: string): boolean                // letters, digits, '.', '_', '-'; starts alphanumeric; ≤ 150 chars
function datePartsIn(timeZone: string, date: Date): DateParts
interface PlannedId { id: string; writes: PendingWrite[] }
function planId(tx: Transaction, db: Firestore, meta: DocTypeMeta, data: Record<string, unknown>, date: DateParts): Promise<PlannedId>
interface StoreDeps { db: Firestore; registry: Registry }
function docRef(db: Firestore, meta: DocTypeMeta, id: string): DocumentReference
function readDoc(tx: Transaction, ref: DocumentReference): Promise<StoredDoc | null>          // adds `id`
function loadOrgPath(tx: Transaction, deps: StoreDeps, orgId: string): Promise<string[]>       // 422 if unknown
function loadCustomFields(tx: Transaction, deps: StoreDeps, meta: DocTypeMeta, orgPath: readonly string[] | null): Promise<FieldDef[]>
function serializeDoc(value: unknown): unknown            // Timestamp → ISO string, recursively
```

Details:
- `planId` reads the series counter doc `series/{prefix}` inside the transaction. The returned `writes` store the incremented value, and nothing is written until the caller runs them.
- `loadCustomFields` returns the fields defined for the DocType at any org on the given `orgPath`. For global DocTypes (`orgPath` null) it returns all of them, and for `[]` it returns none.

Test fixtures (`tests/emulator/fixtures.ts`) are used by every later emulator test:
- Constants: `NOW` (2026-09-29T02:00Z), `KL`, `PJ`, `TEST_ORGS` (the seed orgs plus `jci-pj` and `jci-singapore`)
- `seedOrgs(db)`, `putDoc(db, collection, id, data)`
- `users.{admin, officer, member, outsider, pjAdmin}`
- The `Person` and `PersonHistory` fixture DocTypes, and `testRegistry`

- [ ] **Step 1: Write the fixtures**

Create `tests/emulator/fixtures.ts`:

```ts
import { createRegistry, defineDocType, type RoleName, type UserContext } from '@jci/core';
import { DOCTYPES, orgDocs, SEED_ORGS, type SeedOrg } from '@jci/doctypes';
import type { Firestore } from 'firebase-admin/firestore';

/** 10:00 on 29 Sep 2026 in Kuala Lumpur. */
export const NOW = new Date('2026-09-29T02:00:00Z');
export const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];
export const PJ = [...KL.slice(0, 4), 'jci-pj'];

export const TEST_ORGS: readonly SeedOrg[] = [
  ...SEED_ORGS,
  { code: 'jci-pj', title: 'JCI Petaling Jaya', level: 'local', parent: 'jci-malaysia-central' },
  { code: 'jci-singapore', title: 'JCI Singapore', level: 'national', parent: 'jci-asia-pacific' },
];

export async function seedOrgs(db: Firestore): Promise<void> {
  const batch = db.batch();
  for (const o of orgDocs(TEST_ORGS)) batch.set(db.collection('organizations').doc(String(o.id)), o);
  await batch.commit();
}

export async function putDoc(db: Firestore, collection: string, id: string, data: Record<string, unknown>): Promise<void> {
  await db.collection(collection).doc(id).set({ id, ...data });
}

function user(uid: string, personId: string | null, ...grants: [RoleName, string, boolean][]): UserContext {
  return { uid, personId, grants: grants.map(([role, orgId, withDescendants]) => ({ role, orgId, withDescendants })) };
}

export const users = {
  admin: user('u-admin', 'p-admin', ['SystemManager', 'jci', true]),
  officer: user('u-officer', 'p-officer', ['MembershipOfficer', 'jci-malaysia', true]),
  member: user('u-member', 'p1', ['Member', 'jci-kl', false]),
  outsider: user('u-outsider', 'p-outsider', ['Member', 'jci-pj', false]),
  pjAdmin: user('u-pjadmin', null, ['OrgAdmin', 'jci-pj', false]),
};

export const PersonHistory = defineDocType({
  name: 'PersonHistory',
  module: 'test',
  isChild: true,
  fields: [
    { fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true },
    { fieldname: 'verified', label: 'Verified', fieldtype: 'Check', readOnly: true },
    { fieldname: 'org', label: 'Org', fieldtype: 'Link', link: 'Organization' },
  ],
});

/** Test-only DocType standing in for M4's Person. */
export const Person = defineDocType({
  name: 'Person',
  module: 'test',
  collection: 'persons',
  naming: { kind: 'series', pattern: 'PER-.YYYY.-.#####' },
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data', reqd: true },
    { fieldname: 'email', label: 'Email', fieldtype: 'Data', unique: true },
    { fieldname: 'phone', label: 'Phone', fieldtype: 'Data' },
    { fieldname: 'membershipType', label: 'Type', fieldtype: 'Select', options: ['Probation', 'Official'], permlevel: 1 },
    { fieldname: 'authUid', label: 'Auth UID', fieldtype: 'Data', readOnly: true },
    { fieldname: 'mentor', label: 'Mentor', fieldtype: 'Link', link: 'Person' },
    { fieldname: 'history', label: 'History', fieldtype: 'Table', childDocType: 'PersonHistory' },
  ],
  permissions: [
    { role: 'Member', read: true },
    { role: 'Member', write: true, ifOwner: true },
    { role: 'Member', permlevel: 1, read: true },
    { role: 'MembershipOfficer', read: true, write: true, create: true, delete: true },
    { role: 'MembershipOfficer', permlevel: 1, read: true, write: true },
    { role: 'SystemManager', read: true, write: true, create: true, delete: true },
  ],
});

export const testRegistry = createRegistry([...DOCTYPES, Person, PersonHistory]);
```

- [ ] **Step 2: Write the failing tests**

Create `tests/emulator/store.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:emulator`
Expected: FAIL. `naming` and `store` cannot be resolved.

- [ ] **Step 4: Write the naming helpers**

Create `netlify/functions/_shared/naming.ts`:

```ts
import { formatSeriesName, SERIES_COLLECTION, seriesPrefix, type DateParts, type DocTypeMeta } from '@jci/core';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { invalid } from './errors';

/** A write to apply at the end of a transaction, after every read. */
export type PendingWrite = (tx: Transaction) => void;

const DOC_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/;

export function isValidDocId(id: string): boolean {
  return DOC_ID.test(id);
}

export function datePartsIn(timeZone: string, date: Date): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
  const part = (type: 'year' | 'month' | 'day') => Number(parts.find((p) => p.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

export interface PlannedId {
  id: string;
  writes: PendingWrite[];
}

/** Chooses the new document's id. Series counters are read now and written only when the caller runs `writes`. */
export async function planId(
  tx: Transaction,
  db: Firestore,
  meta: DocTypeMeta,
  data: Record<string, unknown>,
  date: DateParts,
): Promise<PlannedId> {
  const naming = meta.naming;
  switch (naming.kind) {
    case 'autoId':
      return { id: db.collection(meta.collection).doc().id, writes: [] };
    case 'series': {
      const ref = db.collection(SERIES_COLLECTION).doc(seriesPrefix(naming.pattern, date));
      const snap = await tx.get(ref);
      const current = snap.get('current');
      const next = (typeof current === 'number' ? current : 0) + 1;
      return { id: formatSeriesName(naming.pattern, date, next), writes: [(t) => t.set(ref, { current: next })] };
    }
    case 'field':
    case 'fields': {
      const names = naming.kind === 'field' ? [naming.field] : naming.fields;
      const values = names.map((name) => {
        const value = data[name];
        if (typeof value !== 'string' || value.trim() === '') throw invalid([{ path: name, message: 'Required' }]);
        return value.trim();
      });
      const id = values.join('.');
      if (!isValidDocId(id)) {
        throw invalid([{ path: names.join(','), message: 'Use only letters, digits, ".", "_" and "-"' }]);
      }
      return { id, writes: [] };
    }
  }
}
```

- [ ] **Step 5: Write the storage helpers**

Create `netlify/functions/_shared/store.ts`:

```ts
import {
  CUSTOM_FIELD_DOCTYPE,
  customFieldFromDoc,
  ORGANIZATION_DOCTYPE,
  type DocTypeMeta,
  type FieldDef,
  type Registry,
  type StoredDoc,
} from '@jci/core';
import { Timestamp, type DocumentReference, type Firestore, type Query, type Transaction } from 'firebase-admin/firestore';
import { invalid } from './errors';
import { isValidDocId } from './naming';

export interface StoreDeps {
  db: Firestore;
  registry: Registry;
}

export function docRef(db: Firestore, meta: DocTypeMeta, id: string): DocumentReference {
  return db.collection(meta.collection).doc(id);
}

export async function readDoc(tx: Transaction, ref: DocumentReference): Promise<StoredDoc | null> {
  const snap = await tx.get(ref);
  return snap.exists ? { ...snap.data(), id: snap.id } : null;
}

/** orgPath of an existing organisation; 422 when it does not exist. */
export async function loadOrgPath(tx: Transaction, deps: StoreDeps, orgId: string): Promise<string[]> {
  const unknown = invalid([{ path: 'orgId', message: `Unknown organisation "${orgId}"` }]);
  if (!isValidDocId(orgId)) throw unknown;
  const org = await readDoc(tx, docRef(deps.db, deps.registry.get(ORGANIZATION_DOCTYPE), orgId));
  if (!org || !Array.isArray(org.orgPath)) throw unknown;
  return org.orgPath as string[];
}

/**
 * Custom fields for `meta` defined at any org on `orgPath`, sorted by fieldname.
 * Global DocTypes (orgPath null) get every definition; an empty orgPath gets none.
 */
export async function loadCustomFields(
  tx: Transaction,
  deps: StoreDeps,
  meta: DocTypeMeta,
  orgPath: readonly string[] | null,
): Promise<FieldDef[]> {
  if (orgPath !== null && orgPath.length === 0) return [];
  const collection = deps.registry.get(CUSTOM_FIELD_DOCTYPE).collection;
  let query: Query = deps.db.collection(collection).where('targetDocType', '==', meta.name);
  if (orgPath !== null) query = query.where('org', 'in', [...orgPath]);
  const snap = await tx.get(query);
  return snap.docs.map((d) => customFieldFromDoc(d.data())).sort((a, b) => (a.fieldname < b.fieldname ? -1 : 1));
}

/** Converts Firestore Timestamps to ISO strings so a stored document can be sent as JSON. */
export function serializeDoc(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeDoc);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeDoc(v)]));
  }
  return value;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:emulator`
Expected: PASS for `smoke` and `store`.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared tests/emulator
git commit -m "feat(server): naming series, org path and custom field loading helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The save pipeline: create, update and delete with versions and hooks

**Files:**
- Create: `netlify/functions/_shared/pipeline.ts`
- Test: `tests/emulator/pipeline.test.ts`

**Interfaces:**
- Consumes:
  - `resolveDocAccess`, `redactDoc`, `diffDocs`, `buildOrgPath`, `ValidationError`, `VERSIONS_COLLECTION`, `ORGANIZATION_DOCTYPE`, `SYSTEM_FIELDS`
  - the Task 8 helpers
  - `controllers` from `@jci/doctypes` (in tests)
- Produces:

```ts
interface EffectContext { db: Firestore; registry: Registry; doctype: string; id: string; before: StoredDoc | null; after: StoredDoc | null }
type EffectMap = Readonly<Record<string, (ctx: EffectContext) => Promise<void>>>
interface PipelineDeps { db: Firestore; registry: Registry; controllers: ControllerMap; effects?: EffectMap; now?: () => Date; timeZone?: string }
interface SaveResult { id: string; doc: Record<string, unknown>; changed: Change[] }
function createDoc(deps: PipelineDeps, user: UserContext, doctype: string, input: { orgId?: unknown; data: unknown }): Promise<SaveResult>
function updateDoc(deps: PipelineDeps, user: UserContext, doctype: string, id: string, input: { data: unknown }): Promise<SaveResult>
function deleteDoc(deps: PipelineDeps, user: UserContext, doctype: string, id: string): Promise<void>
```

Every step runs inside one Firestore transaction, with all reads before any write. The steps in order:
1. Load the document or the org scope.
2. Load the custom fields.
3. Check permissions with `can` via `resolveDocAccess`.
4. Check field locks.
5. Validate with Zod.
6. Run the controller hooks `validate` and `beforeSave` (or `beforeDelete`).
7. Write the naming counter, the document and the version entry.

The effect runs after commit.

Errors are always `ApiError`:

| Status | Code | When |
| --- | --- | --- |
| 400 | `bad_request` | data is not an object, or `orgId` was sent for a global DocType |
| 400 | `org_required` | an org-scoped create has no `orgId` |
| 403 | `forbidden` | the caller lacks the permission for this action |
| 403 | `field_not_writable` | a locked field changed; `details.fields` lists them |
| 404 | `unknown_doctype` | the DocType is unknown or is a child DocType |
| 404 | `not_found` | the document is missing or the caller cannot read it |
| 409 | `exists` | the new id is already taken |
| 422 | `invalid` | schema, hook, orgId or naming problems; `details.issues` lists them |
| 500 | `effect_failed` | the save committed but its effect failed |

Also:
- An update that changes nothing writes nothing and runs no effect.
- An Organization create treats `orgId` as the parent. The new org's `orgPath` is the parent's path plus its code, and `parent` is set from `orgId`.

- [ ] **Step 1: Write the failing tests**

Create `tests/emulator/pipeline.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:emulator`
Expected: FAIL with `Failed to resolve import "../../netlify/functions/_shared/pipeline"`.

- [ ] **Step 3: Write the pipeline**

Create `netlify/functions/_shared/pipeline.ts`:

```ts
import {
  buildOrgPath,
  diffDocs,
  ORGANIZATION_DOCTYPE,
  redactDoc,
  resolveDocAccess,
  SYSTEM_FIELDS,
  ValidationError,
  VERSIONS_COLLECTION,
  type Change,
  type ControllerMap,
  type DocAccess,
  type DocTypeMeta,
  type FieldDef,
  type HookContext,
  type Registry,
  type StoredDoc,
  type UserContext,
} from '@jci/core';
import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { ApiError, invalid } from './errors';
import { datePartsIn, isValidDocId, planId, type PendingWrite } from './naming';
import { docRef, loadCustomFields, loadOrgPath, readDoc, serializeDoc } from './store';

export interface EffectContext {
  db: Firestore;
  registry: Registry;
  doctype: string;
  id: string;
  /** Stored document before the change; null on create. */
  before: StoredDoc | null;
  /** Stored document after the change; null on delete. */
  after: StoredDoc | null;
}

/** Server-only follow-up work, run after a change commits (for example rebuilding userAccess). */
export type EffectMap = Readonly<Record<string, (ctx: EffectContext) => Promise<void>>>;

export interface PipelineDeps {
  db: Firestore;
  registry: Registry;
  controllers: ControllerMap;
  effects?: EffectMap;
  now?: () => Date;
  /** Time zone for naming-series dates. Default Asia/Kuala_Lumpur. */
  timeZone?: string;
}

export interface SaveResult {
  id: string;
  /** The saved document as the caller may read it, JSON-safe. */
  doc: Record<string, unknown>;
  changed: Change[];
}

const DEFAULT_TIME_ZONE = 'Asia/Kuala_Lumpur';
const SYSTEM = new Set<string>(SYSTEM_FIELDS);

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

function requireDocType(registry: Registry, doctype: string): DocTypeMeta {
  if (!registry.has(doctype) || registry.get(doctype).isChild) {
    throw new ApiError(404, 'unknown_doctype', `Unknown DocType "${doctype}"`);
  }
  return registry.get(doctype);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ApiError(400, 'bad_request', 'data must be a JSON object');
  return value;
}

function notFound(meta: DocTypeMeta, id: string): ApiError {
  return new ApiError(404, 'not_found', `${meta.name} "${id}" not found`);
}

/** Org path used for permissions. An org-scoped document without one denies everyone. */
function storedOrgPath(meta: DocTypeMeta, doc: StoredDoc): string[] | null {
  if (!meta.orgScoped) return null;
  return Array.isArray(doc.orgPath) ? (doc.orgPath as string[]) : [];
}

function split(doc: StoredDoc): { fields: Record<string, unknown>; system: Record<string, unknown> } {
  const fields: Record<string, unknown> = {};
  const system: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) (SYSTEM.has(k) ? system : fields)[k] = v;
  return { fields, system };
}

/** Top-level keys replace; `custom` merges one level deep. */
function applyPatch(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base, ...patch };
  if (isRecord(patch.custom)) merged.custom = { ...(isRecord(base.custom) ? base.custom : {}), ...patch.custom };
  return merged;
}

function assertWritable(access: DocAccess, patch: Record<string, unknown>, before: StoredDoc | null): void {
  const locked = access.unwritableKeys(patch, before);
  if (locked.length > 0) {
    throw new ApiError(403, 'field_not_writable', 'You cannot change some of these fields', { fields: locked });
  }
}

function parseOrThrow(access: DocAccess, mode: 'create' | 'update', data: Record<string, unknown>): Record<string, unknown> {
  const result = access.schema(mode).safeParse(data);
  if (!result.success) {
    throw invalid(result.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })));
  }
  return result.data as Record<string, unknown>;
}

function contextFor(tx: Transaction, deps: PipelineDeps, init: Omit<HookContext, 'registry' | 'get'>): HookContext {
  return {
    ...init,
    registry: deps.registry,
    get: (doctype, id) => (isValidDocId(id) ? readDoc(tx, docRef(deps.db, deps.registry.get(doctype), id)) : Promise.resolve(null)),
  };
}

async function runHooks(deps: PipelineDeps, ctx: HookContext, phase: 'save' | 'delete'): Promise<void> {
  const controller = deps.controllers[ctx.meta.name];
  try {
    if (phase === 'delete') {
      await controller?.beforeDelete?.(ctx);
    } else {
      await controller?.validate?.(ctx);
      await controller?.beforeSave?.(ctx);
    }
  } catch (err) {
    if (err instanceof ValidationError) throw invalid([{ path: err.field ?? '', message: err.message }], err.message);
    throw err;
  }
}

function versionEntry(
  meta: DocTypeMeta,
  id: string,
  action: 'create' | 'update' | 'delete',
  changed: Change[],
  doc: StoredDoc,
  uid: string,
  at: Timestamp,
): Record<string, unknown> {
  return {
    doctype: meta.name,
    docId: id,
    action,
    // Firestore cannot store nested arrays, so each change is a map.
    changed: changed.map(([field, oldValue, newValue]) => ({ field, old: oldValue ?? null, new: newValue ?? null })),
    by: uid,
    at,
    ownerPersonId: doc.ownerPersonId ?? null,
    ...(meta.orgScoped ? { orgId: doc.orgId, orgPath: doc.orgPath } : {}),
  };
}

async function runEffect(deps: PipelineDeps, meta: DocTypeMeta, id: string, before: StoredDoc | null, after: StoredDoc | null) {
  const effect = deps.effects?.[meta.name];
  if (!effect) return;
  try {
    await effect({ db: deps.db, registry: deps.registry, doctype: meta.name, id, before, after });
  } catch (err) {
    console.error(`Effect for ${meta.name} "${id}" failed`, err);
    throw new ApiError(500, 'effect_failed', 'The change was saved, but a follow-up step failed. Save it again to retry.');
  }
}

function respond(doc: StoredDoc, readable: readonly FieldDef[], changed: Change[]): SaveResult {
  return { id: String(doc.id), doc: serializeDoc(redactDoc(doc, readable)) as Record<string, unknown>, changed };
}

export async function createDoc(
  deps: PipelineDeps,
  user: UserContext,
  doctype: string,
  input: { orgId?: unknown; data: unknown },
): Promise<SaveResult> {
  const meta = requireDocType(deps.registry, doctype);
  const raw = asRecord(input.data);
  const now = (deps.now ?? (() => new Date()))();
  const at = Timestamp.fromDate(now);
  const date = datePartsIn(deps.timeZone ?? DEFAULT_TIME_ZONE, now);
  const resolveChild = (name: string) => deps.registry.get(name);
  const isOrganization = meta.name === ORGANIZATION_DOCTYPE;

  const saved = await deps.db.runTransaction(async (tx) => {
    const data = { ...raw };
    let parentPath: string[] | null = null;
    if (meta.orgScoped) {
      if (typeof input.orgId !== 'string' || input.orgId === '') {
        throw new ApiError(400, 'org_required', `orgId is required to create ${meta.name}`);
      }
      parentPath = await loadOrgPath(tx, deps, input.orgId);
    } else if (input.orgId !== undefined) {
      throw new ApiError(400, 'bad_request', `${meta.name} is not scoped to an organisation, so do not send orgId`);
    }

    const planned = await planId(tx, deps.db, meta, data, date);
    // An Organization's own path extends its parent's; every other document sits in the given org.
    const orgPath = parentPath !== null && isOrganization ? buildOrgPath(parentPath, planned.id) : parentPath;
    const customFields = await loadCustomFields(tx, deps, meta, parentPath);
    const access = resolveDocAccess({ meta, customFields, user, doc: { orgPath, ownerPersonId: user.personId }, resolveChild });
    if (!access.canCreate) throw new ApiError(403, 'forbidden', `You cannot create ${meta.name} here`);
    assertWritable(access, data, null);
    if (isOrganization) data.parent = input.orgId;
    const parsed = parseOrThrow(access, 'create', data);

    const ref = docRef(deps.db, meta, planned.id);
    if ((await tx.get(ref)).exists) throw new ApiError(409, 'exists', `${meta.name} "${planned.id}" already exists`);
    const ctx = contextFor(tx, deps, { meta, user, isNew: true, id: planned.id, orgPath, before: null, doc: parsed });
    await runHooks(deps, ctx, 'save');
    const writes: PendingWrite[] = [...planned.writes];

    const doc: StoredDoc = {
      ...ctx.doc,
      id: planned.id,
      ...(orgPath !== null ? { orgId: orgPath[orgPath.length - 1], orgPath } : {}),
      ownerPersonId: user.personId,
      createdAt: at,
      createdBy: user.uid,
      updatedAt: at,
      updatedBy: user.uid,
    };
    const changed = diffDocs(null, doc);
    for (const write of writes) write(tx);
    tx.create(ref, doc);
    if (meta.trackChanges) {
      tx.create(deps.db.collection(VERSIONS_COLLECTION).doc(), versionEntry(meta, planned.id, 'create', changed, doc, user.uid, at));
    }
    return { doc, changed, readable: access.readableFields };
  });

  await runEffect(deps, meta, String(saved.doc.id), null, saved.doc);
  return respond(saved.doc, saved.readable, saved.changed);
}

export async function updateDoc(
  deps: PipelineDeps,
  user: UserContext,
  doctype: string,
  id: string,
  input: { data: unknown },
): Promise<SaveResult> {
  const meta = requireDocType(deps.registry, doctype);
  const raw = asRecord(input.data);
  if (!isValidDocId(id)) throw notFound(meta, id);
  const at = Timestamp.fromDate((deps.now ?? (() => new Date()))());
  const resolveChild = (name: string) => deps.registry.get(name);

  const saved = await deps.db.runTransaction(async (tx) => {
    const patch = { ...raw };
    const ref = docRef(deps.db, meta, id);
    const before = await readDoc(tx, ref);
    if (!before) throw notFound(meta, id);
    const orgPath = storedOrgPath(meta, before);
    const ownerPersonId = typeof before.ownerPersonId === 'string' ? before.ownerPersonId : null;
    const customFields = await loadCustomFields(tx, deps, meta, orgPath);
    const access = resolveDocAccess({ meta, customFields, user, doc: { orgPath, ownerPersonId }, resolveChild });
    if (!access.canRead) throw notFound(meta, id);
    if (!access.canWrite) throw new ApiError(403, 'forbidden', `You cannot edit this ${meta.name}`);
    assertWritable(access, patch, before);
    const parsed = parseOrThrow(access, 'update', patch);

    const { fields, system } = split(before);
    const ctx = contextFor(tx, deps, { meta, user, isNew: false, id, orgPath, before, doc: applyPatch(fields, parsed) });
    await runHooks(deps, ctx, 'save');
    const changed = diffDocs(before, ctx.doc);
    if (changed.length === 0) return { before, doc: before, changed, readable: access.readableFields };
    const writes: PendingWrite[] = [];

    const doc: StoredDoc = { ...ctx.doc, ...system, updatedAt: at, updatedBy: user.uid };
    for (const write of writes) write(tx);
    tx.set(ref, doc);
    if (meta.trackChanges) {
      tx.create(deps.db.collection(VERSIONS_COLLECTION).doc(), versionEntry(meta, id, 'update', changed, doc, user.uid, at));
    }
    return { before, doc, changed, readable: access.readableFields };
  });

  if (saved.changed.length > 0) await runEffect(deps, meta, id, saved.before, saved.doc);
  return respond(saved.doc, saved.readable, saved.changed);
}

export async function deleteDoc(deps: PipelineDeps, user: UserContext, doctype: string, id: string): Promise<void> {
  const meta = requireDocType(deps.registry, doctype);
  if (!isValidDocId(id)) throw notFound(meta, id);
  const at = Timestamp.fromDate((deps.now ?? (() => new Date()))());
  const resolveChild = (name: string) => deps.registry.get(name);

  const before = await deps.db.runTransaction(async (tx) => {
    const ref = docRef(deps.db, meta, id);
    const before = await readDoc(tx, ref);
    if (!before) throw notFound(meta, id);
    const orgPath = storedOrgPath(meta, before);
    const ownerPersonId = typeof before.ownerPersonId === 'string' ? before.ownerPersonId : null;
    const access = resolveDocAccess({ meta, customFields: [], user, doc: { orgPath, ownerPersonId }, resolveChild });
    if (!access.canRead) throw notFound(meta, id);
    if (!access.canDelete) throw new ApiError(403, 'forbidden', `You cannot delete this ${meta.name}`);

    const ctx = contextFor(tx, deps, { meta, user, isNew: false, id, orgPath, before, doc: split(before).fields });
    await runHooks(deps, ctx, 'delete');
    const writes: PendingWrite[] = [];

    for (const write of writes) write(tx);
    tx.delete(ref);
    if (meta.trackChanges) {
      tx.create(deps.db.collection(VERSIONS_COLLECTION).doc(), versionEntry(meta, id, 'delete', diffDocs(before, {}), before, user.uid, at));
    }
    return before;
  });

  await runEffect(deps, meta, id, before, null);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:emulator`
Expected: PASS for `smoke`, `store` and `pipeline`. The `effect_failed` test logs `Effect for Person ... failed` to stderr; that output is expected.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/pipeline.ts tests/emulator/pipeline.test.ts
git commit -m "feat(server): save pipeline with permissions, schema, hooks and versions in one transaction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Link integrity and unique fields

**Files:**
- Create: `netlify/functions/_shared/links.ts`, `netlify/functions/_shared/unique.ts`
- Modify: `netlify/functions/_shared/pipeline.ts` (imports plus three insertions)
- Test: `tests/emulator/integrity.test.ts`

**Interfaces:**
- Consumes: `getFieldValue`, `fieldKey`, `deepEqual`, `UNIQUE_KEYS_COLLECTION`; `docRef`, `isValidDocId`, `invalid`, `ApiError`, `PendingWrite`.
- Produces:

```ts
function checkLinks(tx: Transaction, deps: { db: Firestore; registry: Registry }, fields: readonly FieldDef[],
  before: Record<string, unknown> | null, after: Record<string, unknown>): Promise<void>
function planUniques(tx: Transaction, db: Firestore, meta: DocTypeMeta, fields: readonly FieldDef[], id: string,
  before: Record<string, unknown> | null, after: Record<string, unknown>): Promise<PendingWrite[]>
```

- `checkLinks` checks top-level and child-row Link values, but only those that changed since `before`. If any target is missing it throws `422 invalid`, with issue paths such as `mentor` or `history.0.org`.
- `planUniques` keeps one claim document per `unique` value, at `uniqueKeys/{DocType}.{key}.{sha256(value)}`. If another document already holds a claim it throws `409 duplicate` with `details.fields`. Empty values (`null`, `''`) are never claimed.

- [ ] **Step 1: Write the failing tests**

Create `tests/emulator/integrity.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:emulator`
Expected: FAIL in `integrity.test.ts`. The missing links are accepted, and so is the duplicate email.

- [ ] **Step 3: Write the link check**

Create `netlify/functions/_shared/links.ts`:

```ts
import { deepEqual, fieldKey, getFieldValue, type FieldDef, type Registry } from '@jci/core';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { invalid, type Issue } from './errors';
import { isValidDocId } from './naming';
import { docRef } from './store';

interface LinkValue {
  path: string;
  doctype: string;
  id: unknown;
}

function collectLinks(registry: Registry, fields: readonly FieldDef[], doc: Record<string, unknown> | null): LinkValue[] {
  const out: LinkValue[] = [];
  if (!doc) return out;
  for (const f of fields) {
    if (f.fieldtype === 'Link') {
      const id = getFieldValue(doc, fieldKey(f));
      if (id !== null && id !== '') out.push({ path: fieldKey(f), doctype: f.link!, id });
    } else if (f.fieldtype === 'Table' && Array.isArray(doc[f.fieldname])) {
      const child = registry.get(f.childDocType!);
      (doc[f.fieldname] as unknown[]).forEach((row, i) => {
        if (row === null || typeof row !== 'object') return;
        for (const cf of child.fields) {
          const id = (row as Record<string, unknown>)[cf.fieldname] ?? null;
          if (cf.fieldtype === 'Link' && id !== null && id !== '') {
            out.push({ path: `${f.fieldname}.${i}.${cf.fieldname}`, doctype: cf.link!, id });
          }
        }
      });
    }
  }
  return out;
}

/** Rejects Link values that point at missing documents. Links unchanged since `before` are not re-checked. */
export async function checkLinks(
  tx: Transaction,
  deps: { db: Firestore; registry: Registry },
  fields: readonly FieldDef[],
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<void> {
  const previous = collectLinks(deps.registry, fields, before);
  const issues: Issue[] = [];
  for (const link of collectLinks(deps.registry, fields, after)) {
    if (previous.some((p) => p.path === link.path && deepEqual(p.id, link.id))) continue;
    const exists =
      typeof link.id === 'string' &&
      isValidDocId(link.id) &&
      (await tx.get(docRef(deps.db, deps.registry.get(link.doctype), link.id))).exists;
    if (!exists) issues.push({ path: link.path, message: `${link.doctype} "${String(link.id)}" does not exist` });
  }
  if (issues.length > 0) throw invalid(issues);
}
```

- [ ] **Step 4: Write the unique check**

Create `netlify/functions/_shared/unique.ts`:

```ts
import { createHash } from 'node:crypto';
import { deepEqual, fieldKey, getFieldValue, UNIQUE_KEYS_COLLECTION, type DocTypeMeta, type FieldDef } from '@jci/core';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { ApiError } from './errors';
import type { PendingWrite } from './naming';

function claimRef(db: Firestore, doctype: string, key: string, value: unknown): DocumentReference {
  const hash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return db.collection(UNIQUE_KEYS_COLLECTION).doc(`${doctype}.${key}.${hash}`);
}

const isEmpty = (v: unknown): boolean => v === null || v === '';

/**
 * Enforces `unique` fields with one claim document per value. Reads happen now; the returned
 * writes claim new values and release old ones. Pass after = {} for a delete.
 */
export async function planUniques(
  tx: Transaction,
  db: Firestore,
  meta: DocTypeMeta,
  fields: readonly FieldDef[],
  id: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<PendingWrite[]> {
  const writes: PendingWrite[] = [];
  const conflicts: string[] = [];
  for (const f of fields) {
    if (f.unique !== true) continue;
    const key = fieldKey(f);
    const oldValue = getFieldValue(before, key);
    const newValue = getFieldValue(after, key);
    if (deepEqual(oldValue, newValue)) continue;
    if (!isEmpty(newValue)) {
      const ref = claimRef(db, meta.name, key, newValue);
      const claim = await tx.get(ref);
      if (claim.exists && claim.get('docId') !== id) conflicts.push(key);
      else writes.push((t) => t.set(ref, { doctype: meta.name, field: key, docId: id }));
    }
    if (!isEmpty(oldValue)) {
      const ref = claimRef(db, meta.name, key, oldValue);
      writes.push((t) => t.delete(ref));
    }
  }
  if (conflicts.length > 0) {
    throw new ApiError(409, 'duplicate', 'Another document already uses this value', { fields: conflicts });
  }
  return writes;
}
```

- [ ] **Step 5: Wire both into the pipeline**

In `netlify/functions/_shared/pipeline.ts`, add these imports after the `./errors` import:

```ts
import { checkLinks } from './links';
import { planUniques } from './unique';
```

In `createDoc`, replace

```ts
    const writes: PendingWrite[] = [...planned.writes];
```

with

```ts
    const writes: PendingWrite[] = [...planned.writes];
    await checkLinks(tx, deps, access.fields, null, ctx.doc);
    writes.push(...(await planUniques(tx, deps.db, meta, access.fields, planned.id, null, ctx.doc)));
```

In `updateDoc`, replace

```ts
    if (changed.length === 0) return { before, doc: before, changed, readable: access.readableFields };
    const writes: PendingWrite[] = [];
```

with

```ts
    if (changed.length === 0) return { before, doc: before, changed, readable: access.readableFields };
    const writes: PendingWrite[] = [];
    await checkLinks(tx, deps, access.fields, before, ctx.doc);
    writes.push(...(await planUniques(tx, deps.db, meta, access.fields, id, before, ctx.doc)));
```

In `deleteDoc`, replace

```ts
    await runHooks(deps, ctx, 'delete');
    const writes: PendingWrite[] = [];
```

with

```ts
    await runHooks(deps, ctx, 'delete');
    const writes: PendingWrite[] = [];
    writes.push(...(await planUniques(tx, deps.db, meta, access.fields, id, before, {})));
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:emulator`
Expected: PASS for every file, including the earlier `pipeline.test.ts` tests.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared tests/emulator/integrity.test.ts
git commit -m "feat(server): Link integrity and unique-value claims in the save transaction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Access sync: `userAccess` rebuilt from role assignments

**Files:**
- Create: `netlify/functions/_shared/access.ts`, `netlify/functions/_shared/effects.ts`
- Test: `tests/emulator/access.test.ts`

**Interfaces:**
- Consumes: `buildUserAccess`, `userContextFromAccess`, `USER_ACCESS_COLLECTION`, `ROLE_ASSIGNMENT_DOCTYPE`; `EffectMap` (Task 9).
- Produces:

```ts
function loadUserContext(db: Firestore, uid: string): Promise<UserContext>               // empty grants when missing
function rebuildUserAccess(deps: { db: Firestore; registry: Registry }, uid: string): Promise<UserAccessDoc>
const serverEffects: EffectMap   // RoleAssignment → rebuild userAccess for the uid before and after the change
```

- `rebuildUserAccess` queries `roleAssignments where uid == X`, keeps any existing `personId` (M4 sets it), and writes `userAccess/{uid}` with an `updatedAt` server timestamp.

- [ ] **Step 1: Write the failing tests**

Create `tests/emulator/access.test.ts`:

```ts
import { controllers } from '@jci/doctypes';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadUserContext, rebuildUserAccess } from '../../netlify/functions/_shared/access';
import { serverEffects } from '../../netlify/functions/_shared/effects';
import { createDoc, deleteDoc, updateDoc, type PipelineDeps } from '../../netlify/functions/_shared/pipeline';
import { NOW, seedOrgs, testRegistry, users } from './fixtures';
import { testProject } from './helpers';

const project = testProject('demo-jci-access');
const deps: PipelineDeps = { db: project.db, registry: testRegistry, controllers, effects: serverEffects, now: () => NOW };
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:emulator`
Expected: FAIL with `Failed to resolve import "../../netlify/functions/_shared/access"`.

- [ ] **Step 3: Write the access module**

Create `netlify/functions/_shared/access.ts`:

```ts
import {
  buildUserAccess,
  ROLE_ASSIGNMENT_DOCTYPE,
  USER_ACCESS_COLLECTION,
  userContextFromAccess,
  type Registry,
  type UserAccessDoc,
  type UserContext,
} from '@jci/core';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/** The caller's grants, from userAccess/{uid}. A user without that doc has no roles. */
export async function loadUserContext(db: Firestore, uid: string): Promise<UserContext> {
  const snap = await db.collection(USER_ACCESS_COLLECTION).doc(uid).get();
  return userContextFromAccess(snap.exists ? snap.data() : null, uid);
}

/** Recomputes userAccess/{uid} from the user's RoleAssignment documents. */
export async function rebuildUserAccess(deps: { db: Firestore; registry: Registry }, uid: string): Promise<UserAccessDoc> {
  const collection = deps.registry.get(ROLE_ASSIGNMENT_DOCTYPE).collection;
  const assignments = await deps.db.collection(collection).where('uid', '==', uid).get();
  const grants = assignments.docs.map((d) => ({ role: d.get('role'), orgId: d.get('orgId'), withDescendants: d.get('withDescendants') }));
  const ref = deps.db.collection(USER_ACCESS_COLLECTION).doc(uid);
  const personId: unknown = (await ref.get()).get('personId');
  const access = buildUserAccess(uid, typeof personId === 'string' ? personId : null, grants);
  await ref.set({ ...access, updatedAt: FieldValue.serverTimestamp() });
  return access;
}
```

- [ ] **Step 4: Write the effects**

Create `netlify/functions/_shared/effects.ts`:

```ts
import { ROLE_ASSIGNMENT_DOCTYPE } from '@jci/core';
import { rebuildUserAccess } from './access';
import type { EffectMap } from './pipeline';

/** Post-commit effects for the deployed API. */
export const serverEffects: EffectMap = {
  [ROLE_ASSIGNMENT_DOCTYPE]: async ({ db, registry, before, after }) => {
    const uids = new Set<string>();
    for (const doc of [before, after]) if (typeof doc?.uid === 'string') uids.add(doc.uid);
    for (const uid of uids) await rebuildUserAccess({ db, registry }, uid);
  },
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:emulator`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/access.ts netlify/functions/_shared/effects.ts tests/emulator/access.test.ts
git commit -m "feat(server): rebuild userAccess from role assignments after each change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The `/api/resource` Netlify Function

**Files:**
- Create: `netlify/functions/_shared/http.ts`, `netlify/functions/_shared/auth.ts`, `netlify/functions/_shared/resource.ts`
- Create: `netlify/functions/resource.ts`
- Test: `tests/emulator/resource.test.ts`

**Interfaces:**
- Consumes: `createDoc`, `updateDoc`, `deleteDoc`, `PipelineDeps`; `loadUserContext`; `serverEffects`; `serverApp`, `firestoreFor`; `ApiError`; `ValidationError`.
- Produces:

```ts
function json(status: number, body: unknown, headers?: Record<string, string>): Response
function readJson(req: Request): Promise<Record<string, unknown>>        // 400 invalid_json
function parseOrigins(value: string | undefined): string[]              // comma-separated ALLOWED_ORIGINS
function corsHeaders(req: Request, allowed: readonly string[]): Record<string, string>
function toErrorResponse(err: unknown, headers: Record<string, string>): Response
function authenticate(req: Request, auth: Auth): Promise<string>        // uid; 401 unauthenticated
interface ResourceDeps extends PipelineDeps { auth: Auth; allowedOrigins: readonly string[] }
interface ResourceParams { doctype?: string; id?: string }
function handleResource(req: Request, params: ResourceParams, deps: ResourceDeps): Promise<Response>
```

The HTTP contract:

| Request | Body | Response |
| --- | --- | --- |
| `POST /api/resource/:doctype` | `{ orgId?, data }` | `201 { data }` |
| `PUT /api/resource/:doctype/:id` | `{ data }` | `200 { data }` |
| `DELETE /api/resource/:doctype/:id` | none | `204` |
| `OPTIONS` | none | `204` with CORS headers |
| any other method or shape | any | `405 method_not_allowed` |

Every non-OPTIONS request needs `Authorization: Bearer <Firebase ID token>`. Errors use the JSON shape from Global Constraints and carry the same CORS headers as successes.

- [ ] **Step 1: Write the failing tests**

Create `tests/emulator/resource.test.ts`:

```ts
import { buildUserAccess, type RoleGrant } from '@jci/core';
import { controllers } from '@jci/doctypes';
import { getAuth } from 'firebase-admin/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serverEffects } from '../../netlify/functions/_shared/effects';
import { handleResource, type ResourceDeps } from '../../netlify/functions/_shared/resource';
import { NOW, seedOrgs, testRegistry } from './fixtures';
import { clearAuth, signUp, testProject } from './helpers';

// The Auth emulator issues sign-up tokens for the default project, so this file uses demo-jci.
const project = testProject('demo-jci');
const ORIGIN = 'http://localhost:8081';
let deps: ResourceDeps;
let officer: { uid: string; idToken: string };
let member: { uid: string; idToken: string };

async function setAccess(uid: string, personId: string, grants: RoleGrant[]) {
  await project.db.collection('userAccess').doc(uid).set(buildUserAccess(uid, personId, grants));
}

function call(method: string, path: string, opts: { token?: string; body?: unknown; rawBody?: string; origin?: string } = {}) {
  const [, , , doctype, id] = path.split('/');
  const headers = new Headers();
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`);
  if (opts.origin) headers.set('origin', opts.origin);
  const body = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  if (body !== undefined) headers.set('content-type', 'application/json');
  return handleResource(new Request(`http://localhost${path}`, { method, headers, body }), { doctype, id }, deps);
}

beforeAll(async () => {
  await clearAuth(project.projectId);
  officer = await signUp('officer@jci.test');
  member = await signUp('member@jci.test');
  deps = {
    db: project.db,
    auth: getAuth(project.app),
    registry: testRegistry,
    controllers,
    effects: serverEffects,
    allowedOrigins: [ORIGIN],
    now: () => NOW,
  };
});
beforeEach(async () => {
  await project.clear();
  await seedOrgs(project.db);
  await setAccess(officer.uid, 'p-officer', [{ role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true }]);
  await setAccess(member.uid, 'p1', [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }]);
});
afterAll(() => project.close());

const createPerson = async (data: Record<string, unknown> = {}) => {
  const res = await call('POST', '/api/resource/Person', { token: officer.idToken, body: { orgId: 'jci-kl', data: { fullName: 'Tan', ...data } } });
  return (await res.json()).data as { id: string };
};

describe('/api/resource', () => {
  it('requires a valid ID token', async () => {
    expect((await call('POST', '/api/resource/Person', { body: {} })).status).toBe(401);
    const res = await call('POST', '/api/resource/Person', { token: 'not-a-token', body: {} });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthenticated', message: expect.any(String) } });
  });

  it('creates a document and returns it', async () => {
    const res = await call('POST', '/api/resource/Person', { token: officer.idToken, body: { orgId: 'jci-kl', data: { fullName: 'Tan Ah Kow' } } });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()).data).toMatchObject({ id: 'PER-2026-00001', fullName: 'Tan Ah Kow', orgId: 'jci-kl', createdBy: officer.uid });
  });

  it('maps pipeline errors to JSON error responses', async () => {
    const forbidden = await call('POST', '/api/resource/Person', { token: member.idToken, body: { orgId: 'jci-kl', data: { fullName: 'A' } } });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error.code).toBe('forbidden');

    const invalid = await call('POST', '/api/resource/Person', { token: officer.idToken, body: { orgId: 'jci-kl', data: { fullName: '' } } });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.details.issues[0].path).toBe('fullName');

    const unknown = await call('POST', '/api/resource/Nope', { token: officer.idToken, body: { orgId: 'jci-kl', data: {} } });
    expect(unknown.status).toBe(404);
  });

  it('rejects bodies that are not JSON objects', async () => {
    const res = await call('POST', '/api/resource/Person', { token: officer.idToken, rawBody: 'nope' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_json');
    expect((await call('POST', '/api/resource/Person', { token: officer.idToken, body: [1] })).status).toBe(400);
  });

  it('updates and deletes', async () => {
    const { id } = await createPerson();
    const put = await call('PUT', `/api/resource/Person/${id}`, { token: officer.idToken, body: { data: { phone: '2' } } });
    expect(put.status).toBe(200);
    expect((await put.json()).data).toMatchObject({ id, phone: '2' });
    const del = await call('DELETE', `/api/resource/Person/${id}`, { token: officer.idToken });
    expect(del.status).toBe(204);
    expect((await project.db.collection('persons').doc(id).get()).exists).toBe(false);
  });

  it('rejects a member changing a locked field on their own record', async () => {
    const { id } = await createPerson({ membershipType: 'Probation' });
    await project.db.collection('persons').doc(id).update({ ownerPersonId: 'p1' });
    const ok = await call('PUT', `/api/resource/Person/${id}`, { token: member.idToken, body: { data: { phone: '3' } } });
    expect(ok.status).toBe(200);
    const res = await call('PUT', `/api/resource/Person/${id}`, { token: member.idToken, body: { data: { membershipType: 'Official' } } });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatchObject({ code: 'field_not_writable', details: { fields: ['membershipType'] } });
  });

  it('answers only POST, PUT and DELETE in the right shapes', async () => {
    expect((await call('GET', '/api/resource/Person', { token: officer.idToken })).status).toBe(405);
    expect((await call('POST', '/api/resource/Person/PER-1', { token: officer.idToken, body: {} })).status).toBe(405);
    expect((await call('PUT', '/api/resource/Person', { token: officer.idToken, body: {} })).status).toBe(405);
  });

  it('sends CORS headers to allowed origins only', async () => {
    const preflight = await call('OPTIONS', '/api/resource/Person', { origin: ORIGIN });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
    const other = await call('OPTIONS', '/api/resource/Person', { origin: 'https://evil.example' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    const error = await call('POST', '/api/resource/Person', { origin: ORIGIN, body: {} });
    expect(error.status).toBe(401);
    expect(error.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:emulator`
Expected: FAIL with `Failed to resolve import "../../netlify/functions/_shared/resource"`.

- [ ] **Step 3: Write the HTTP helpers**

Create `netlify/functions/_shared/http.ts`:

```ts
import { ValidationError } from '@jci/core';
import { ApiError } from './errors';

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body must be JSON');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'invalid_json', 'The request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '');
}

/** CORS for browser clients on another origin (e.g. Expo web in dev). Native apps send no Origin. */
export function corsHeaders(req: Request, allowed: readonly string[]): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin || !allowed.includes(origin)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

export function toErrorResponse(err: unknown, headers: Record<string, string>): Response {
  if (err instanceof ApiError) {
    const error = { code: err.code, message: err.message, ...(err.details === undefined ? {} : { details: err.details }) };
    return json(err.status, { error }, headers);
  }
  if (err instanceof ValidationError) {
    const details = { issues: [{ path: err.field ?? '', message: err.message }] };
    return json(422, { error: { code: 'invalid', message: err.message, details } }, headers);
  }
  console.error(err);
  return json(500, { error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, headers);
}
```

- [ ] **Step 4: Write the token check**

Create `netlify/functions/_shared/auth.ts`:

```ts
import type { Auth } from 'firebase-admin/auth';
import { ApiError } from './errors';

/** The uid of the caller's Firebase ID token (Authorization: Bearer <token>). */
export async function authenticate(req: Request, auth: Auth): Promise<string> {
  const match = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) throw new ApiError(401, 'unauthenticated', 'Sign in first');
  try {
    return (await auth.verifyIdToken(match[1]!)).uid;
  } catch {
    throw new ApiError(401, 'unauthenticated', 'Your session has expired. Sign in again.');
  }
}
```

- [ ] **Step 5: Write the handler**

Create `netlify/functions/_shared/resource.ts`:

```ts
import type { Auth } from 'firebase-admin/auth';
import { loadUserContext } from './access';
import { authenticate } from './auth';
import { ApiError } from './errors';
import { corsHeaders, json, readJson, toErrorResponse } from './http';
import { createDoc, deleteDoc, updateDoc, type PipelineDeps } from './pipeline';

export interface ResourceDeps extends PipelineDeps {
  auth: Auth;
  allowedOrigins: readonly string[];
}

export interface ResourceParams {
  doctype?: string;
  id?: string;
}

/** POST /api/resource/:doctype, PUT and DELETE /api/resource/:doctype/:id. */
export async function handleResource(req: Request, params: ResourceParams, deps: ResourceDeps): Promise<Response> {
  const cors = corsHeaders(req, deps.allowedOrigins);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const { doctype, id } = params;
    if (!doctype) throw new ApiError(404, 'not_found', 'Not found');
    const creating = req.method === 'POST' && !id;
    const changing = (req.method === 'PUT' || req.method === 'DELETE') && Boolean(id);
    if (!creating && !changing) throw new ApiError(405, 'method_not_allowed', `${req.method} is not supported here`);

    const user = await loadUserContext(deps.db, await authenticate(req, deps.auth));
    if (req.method === 'POST') {
      const body = await readJson(req);
      const result = await createDoc(deps, user, doctype, { orgId: body.orgId, data: body.data });
      return json(201, { data: result.doc }, cors);
    }
    if (req.method === 'PUT') {
      const body = await readJson(req);
      const result = await updateDoc(deps, user, doctype, id!, { data: body.data });
      return json(200, { data: result.doc }, cors);
    }
    await deleteDoc(deps, user, doctype, id!);
    return new Response(null, { status: 204, headers: cors });
  } catch (err) {
    return toErrorResponse(err, cors);
  }
}
```

- [ ] **Step 6: Write the Netlify Function**

Create `netlify/functions/resource.ts`:

```ts
import { controllers, registry } from '@jci/doctypes';
import type { Config, Context } from '@netlify/functions';
import { getAuth } from 'firebase-admin/auth';
import { firestoreFor, serverApp } from './_shared/admin';
import { serverEffects } from './_shared/effects';
import { parseOrigins } from './_shared/http';
import { handleResource } from './_shared/resource';

export default async (req: Request, context: Context): Promise<Response> => {
  const app = serverApp();
  return handleResource(req, context.params, {
    db: firestoreFor(app),
    auth: getAuth(app),
    registry,
    controllers,
    effects: serverEffects,
    allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  });
};

export const config: Config = {
  path: ['/api/resource/:doctype', '/api/resource/:doctype/:id'],
};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:emulator`
Expected: PASS.

Run: `npm run check`
Expected: PASS. `tsconfig.server.json` typechecks `resource.ts` against the `@netlify/functions` types.

- [ ] **Step 8: Commit**

```bash
git add netlify/functions tests/emulator/resource.test.ts
git commit -m "feat(api): /api/resource Netlify Function with token auth, CORS and JSON errors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Firestore rules tests

**Files:**
- Test: `tests/emulator/rules.test.ts`

**Interfaces:**
- Consumes:
  - the generated `firestore.rules` (Task 6)
  - `buildUserAccess` (Task 4)
  - `orgDocs` (Task 6)
  - `TEST_ORGS`, `KL`, `PJ` (Task 8)
  - `requireEmulators` (Task 7)
- Produces: no code. The tests pin these spec requirements:
  - A member cannot read another org's data or any role assignment.
  - A member cannot write any DocType collection directly.
  - A national officer can read the whole local subtree.

- [ ] **Step 1: Write the tests**

Create `tests/emulator/rules.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { buildUserAccess, type RoleGrant, type RoleName } from '@jci/core';
import { orgDocs } from '@jci/doctypes';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { KL, PJ, TEST_ORGS } from './fixtures';
import { requireEmulators } from './helpers';

let env: RulesTestEnvironment;
const grant = (role: RoleName, orgId: string, withDescendants = false): RoleGrant => ({ role, orgId, withDescendants });
const ACCESS = {
  'member-kl': buildUserAccess('member-kl', 'p-kl', [grant('Member', 'jci-kl')]),
  'officer-my': buildUserAccess('officer-my', 'p-my', [grant('MembershipOfficer', 'jci-malaysia', true)]),
  'admin-pj': buildUserAccess('admin-pj', null, [grant('OrgAdmin', 'jci-pj')]),
};
const as = (uid: string) => env.authenticatedContext(uid).firestore();

beforeAll(async () => {
  requireEmulators();
  env = await initializeTestEnvironment({
    projectId: 'demo-jci-rules',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const org of orgDocs(TEST_ORGS)) await db.collection('organizations').doc(String(org.id)).set(org);
    for (const [uid, access] of Object.entries(ACCESS)) await db.collection('userAccess').doc(uid).set(access);
    const inOrg = (orgPath: string[]) => ({ orgId: orgPath[orgPath.length - 1], orgPath, ownerPersonId: null });
    await db.collection('roleAssignments').doc('ra-kl').set({ uid: 'member-kl', role: 'Member', ...inOrg(KL) });
    await db.collection('roleAssignments').doc('ra-pj').set({ uid: 'admin-pj', role: 'OrgAdmin', ...inOrg(PJ) });
    await db
      .collection('customFields')
      .doc('Organization.motto')
      .set({ targetDocType: 'Organization', fieldname: 'motto', label: 'Motto', fieldtype: 'Data', org: 'jci-malaysia', ownerPersonId: null });
    const version = { doctype: 'Organization', action: 'update', changed: [], by: 'x' };
    await db.collection('versions').doc('v-kl').set({ ...version, docId: 'jci-kl', ...inOrg(KL) });
    await db.collection('versions').doc('v-pj').set({ ...version, docId: 'jci-pj', ...inOrg(PJ) });
  });
});

afterAll(() => env?.cleanup());

describe('org-scoped reads', () => {
  it('lets a member read their own local only', async () => {
    await assertSucceeds(as('member-kl').collection('organizations').doc('jci-kl').get());
    await assertFails(as('member-kl').collection('organizations').doc('jci-pj').get());
    await assertFails(as('member-kl').collection('organizations').doc('jci-malaysia').get());
  });

  it('lets a national officer read the whole national subtree', async () => {
    for (const id of ['jci-malaysia', 'jci-malaysia-central', 'jci-kl', 'jci-pj']) {
      await assertSucceeds(as('officer-my').collection('organizations').doc(id).get());
    }
    await assertFails(as('officer-my').collection('organizations').doc('jci-singapore').get());
  });

  it('keeps role assignments private to administrators of the org', async () => {
    await assertFails(as('member-kl').collection('roleAssignments').doc('ra-kl').get());
    await assertSucceeds(as('admin-pj').collection('roleAssignments').doc('ra-pj').get());
    await assertFails(as('admin-pj').collection('roleAssignments').doc('ra-kl').get());
  });

  it('reads versions under the same rules as their document', async () => {
    await assertSucceeds(as('member-kl').collection('versions').doc('v-kl').get());
    await assertFails(as('member-kl').collection('versions').doc('v-pj').get());
  });

  it('lets any role holder read global DocTypes, and nobody else', async () => {
    await assertSucceeds(as('member-kl').collection('customFields').doc('Organization.motto').get());
    await assertFails(as('nobody').collection('customFields').doc('Organization.motto').get());
    await assertFails(env.unauthenticatedContext().firestore().collection('customFields').doc('Organization.motto').get());
  });
});

describe('list queries', () => {
  it('allow a member to list their exact org', async () => {
    await assertSucceeds(as('member-kl').collection('organizations').where('orgId', '==', 'jci-kl').get());
  });

  // Known risk (see "Decisions"): if this fails, stop and report instead of loosening the rules.
  it('allow an officer to list the subtree they cover', async () => {
    await assertSucceeds(as('officer-my').collection('organizations').where('orgPath', 'array-contains', 'jci-malaysia').get());
  });

  it('deny a list that could include orgs outside the caller scope', async () => {
    await assertFails(as('member-kl').collection('organizations').where('orgPath', 'array-contains', 'jci-malaysia').get());
    await assertFails(as('member-kl').collection('organizations').get());
  });
});

describe('writes and userAccess', () => {
  it('deny every client write', async () => {
    await assertFails(as('officer-my').collection('organizations').doc('jci-kl').set({ title: 'Hacked' }));
    await assertFails(as('admin-pj').collection('roleAssignments').doc('new').set({ uid: 'admin-pj', role: 'SystemManager' }));
    await assertFails(as('member-kl').collection('versions').add({ doctype: 'Organization' }));
    await assertFails(as('member-kl').collection('userAccess').doc('member-kl').set({ scopes: {} }));
    await assertFails(as('member-kl').collection('series').doc('PER-2026-').set({ current: 0 }));
  });

  it('let users read only their own userAccess', async () => {
    await assertSucceeds(as('member-kl').collection('userAccess').doc('member-kl').get());
    await assertFails(as('member-kl').collection('userAccess').doc('officer-my').get());
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm run test:emulator`
Expected: PASS. The rules come from Task 6; this task only adds tests.

If `allow an officer to list the subtree they cover` fails, **stop and report it to the user** with the error text. See "Known risk" at the top: the fix changes how clients query, so it is a design decision.

If any other rules test fails, the generated rules are wrong. Fix `generateRules.ts` (Task 5), run `npm run gen:rules`, and rerun both `npm run check` and `npm run test:emulator`.

- [ ] **Step 3: Commit**

```bash
git add tests/emulator/rules.test.ts
git commit -m "test(rules): org-scoped reads, private role assignments and denied client writes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Dev workflow, CI, docs and the manual API smoke test

**Files:**
- Create: `scripts/seed-dev.mts`, `netlify.toml`, `.env.example`, `README.md`, `docs/superpowers/plans/m2-followups.md`
- Modify: `package.json` (script `seed:dev`), `.github/workflows/ci.yml`, `docs/superpowers/plans/m1-followups.md`

**Interfaces:**
- Consumes: `orgDocs`, `SEED_ORGS`, `registry`, `rebuildUserAccess`, `firestoreFor`.
- Produces:
  - `npm run seed:dev`, which seeds the emulator with the five seed orgs and a System Manager `admin@jci.test`. The password is `jci-dev-password`; the account exists only in the Auth emulator.
  - `netlify dev` serving the web build plus `/api/resource`.
  - CI running the emulator tests.

- [ ] **Step 1: Write the seed script**

Create `scripts/seed-dev.mts`:

```ts
import { ORGANIZATION_DOCTYPE, ROLE_ASSIGNMENT_DOCTYPE } from '@jci/core';
import { orgDocs, registry, SEED_ORGS } from '@jci/doctypes';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { rebuildUserAccess } from '../netlify/functions/_shared/access';
import { firestoreFor } from '../netlify/functions/_shared/admin';

// Emulator only. The hosts match firebase.json, and a demo- project can never reach production.
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const PROJECT_ID = 'demo-jci';
/** Dev-only account that exists only in the Auth emulator. */
const DEV_ADMIN = { email: 'admin@jci.test', password: 'jci-dev-password' };

const app = initializeApp({ projectId: PROJECT_ID });
const db = firestoreFor(app);
const auth = getAuth(app);

const organizations = registry.get(ORGANIZATION_DOCTYPE).collection;
for (const org of orgDocs(SEED_ORGS)) await db.collection(organizations).doc(String(org.id)).set(org);

const existing = await auth.getUserByEmail(DEV_ADMIN.email).catch(() => null);
const uid = existing?.uid ?? (await auth.createUser(DEV_ADMIN)).uid;
const assignmentId = `seed-${uid}`;
await db
  .collection(registry.get(ROLE_ASSIGNMENT_DOCTYPE).collection)
  .doc(assignmentId)
  .set({ id: assignmentId, uid, role: 'SystemManager', withDescendants: true, orgId: 'jci', orgPath: ['jci'], ownerPersonId: null });
await rebuildUserAccess({ db, registry }, uid);

console.log(`Seeded ${SEED_ORGS.length} organisations and ${DEV_ADMIN.email} (uid ${uid}) as System Manager at jci.`);
```

In the root `package.json` `scripts`, add `"seed:dev": "tsx scripts/seed-dev.mts"`.

- [ ] **Step 2: Add the Netlify and env config**

Create `netlify.toml`:

```toml
[build]
  command = "npm run build:web"
  publish = "apps/app/dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[dev]
  framework = "#static"
  publish = "apps/app/dist"
  port = 8888
```

Create `.env.example`:

```
# Local development against the Firebase emulators (copy to .env; netlify dev loads it).
FIREBASE_PROJECT_ID=demo-jci
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
# Browser origins allowed to call /api/resource (Expo web dev server).
ALLOWED_ORIGINS=http://localhost:8081
# Production only, set in the Netlify UI, never committed:
# FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

- [ ] **Step 3: Run the manual API smoke test**

In terminal 1, start the emulators and leave them running:

```bash
npm run emulators
```

In terminal 2:

```bash
npm run seed:dev
```

Expected: `Seeded 5 organisations and admin@jci.test (uid ...) as System Manager at jci.`

```bash
cp .env.example .env
```

```bash
npm run build:web
```

```bash
netlify dev
```

Expected: `Local dev server ready: http://localhost:8888`, with the `resource` function loaded.

In terminal 3, get an ID token for the dev admin:

```bash
TOKEN=$(curl -s "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key" -H "content-type: application/json" -d '{"email":"admin@jci.test","password":"jci-dev-password","returnSecureToken":true}' | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).idToken))")
```

Create an organisation:

```bash
curl -s -X POST http://localhost:8888/api/resource/Organization -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"orgId":"jci-malaysia-central","data":{"code":"jci-pj","title":"JCI Petaling Jaya","level":"local"}}'
```

Expected: `{"data":{...,"id":"jci-pj","orgPath":["jci","jci-asia-pacific","jci-malaysia","jci-malaysia-central","jci-pj"],...}}`

Check that a version entry was written. The `owner` token bypasses rules on the emulator:

```bash
curl -s "http://127.0.0.1:8080/v1/projects/demo-jci/databases/(default)/documents/versions" -H "Authorization: Bearer owner"
```

Expected: one document with `doctype` `Organization`, `docId` `jci-pj` and `action` `create`.

Check that a locked change is rejected:

```bash
curl -s -X PUT http://localhost:8888/api/resource/Organization/jci-pj -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"data":{"level":"national_area"}}'
```

Expected: `{"error":{"code":"invalid","message":"The level cannot change",...}}`

Stop `netlify dev` and `npm run emulators` with Ctrl+C. Delete `.env`; it is git-ignored.

- [ ] **Step 4: Run the emulator tests in CI**

Replace `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
      - uses: actions/cache@v4
        with:
          path: ~/.cache/firebase/emulators
          key: firebase-emulators-${{ hashFiles('package-lock.json') }}
      - run: npm ci
      - run: npm run check
      - run: npm run test:emulator
      - run: npm run build:web
```

- [ ] **Step 5: Write the README**

Create `README.md`:

````markdown
# JCI Platform

One Expo app (web, iOS, Android) on a Frappe-style DocType engine, with Firebase and Netlify Functions.
Design: `docs/superpowers/specs/2026-09-29-jci-platform-core-member-crm-design.md`. Plans: `docs/superpowers/plans/`.

## Prerequisites

- Node 22 (at least 20.19)
- JDK 21 on PATH (the Firestore emulator needs it)
- Netlify CLI for `netlify dev`: `npm install -g netlify-cli`

## Commands

| Command | What it does |
| --- | --- |
| `npm run check` | Lint, typecheck, unit tests and UI tests |
| `npm run test:emulator` | Starts the Auth and Firestore emulators and runs `tests/emulator` |
| `npm run gen:rules` | Regenerates `firestore.rules` from the DocType registry (never edit it by hand) |
| `npm run build:web` | Exports the web app to `apps/app/dist` |
| `npm run emulators` | Starts the emulators for manual work |
| `npm run seed:dev` | Seeds the running emulators with the org tree and a dev System Manager |

`npm run emulators` and `npm run test:emulator` use the same ports (8080, 9099), so stop one before starting the other.

## Running the API locally

1. `npm run emulators` (leave it running)
2. `npm run seed:dev`. This creates the account `admin@jci.test` with password `jci-dev-password`. The account exists only in the emulator.
3. `cp .env.example .env`
4. `npm run build:web && netlify dev`. The API is then at `http://localhost:8888/api/resource/:doctype[/:id]`.

## How writes work

Clients read Firestore directly; the generated rules scope those reads by org. Every write goes through `/api/resource`, which runs one transaction with these steps:

1. Check permissions.
2. Check field locks.
3. Validate with Zod.
4. Run the controller hooks.
5. Check links and unique values.
6. Write the document, its version entry and its naming counter.

Post-commit effects, such as rebuilding `userAccess`, run after the transaction.

## Layout

| Path | What it holds |
| --- | --- |
| `packages/core` | The pure TypeScript engine: meta, validation, permissions, diff, the rules generator |
| `packages/doctypes` | DocType definitions and their controllers |
| `packages/ui` | `@jci/ui`, the only UI library app code may use |
| `apps/app` | The Expo Router app |
| `netlify/functions` | `/api/resource` and its `_shared/` modules |
| `tests/emulator` | Tests that run against the Firebase emulators |
````

- [ ] **Step 6: Record follow-ups**

Create `docs/superpowers/plans/m2-followups.md`:

```markdown
# M2 follow-ups (carry into M3 and M4)

## Needed by M4 (membership DocTypes)
- **Firestore rules cannot hide fields.**
  - Permlevel read limits apply to API responses only. A client with read access to a document reads every field directly from Firestore.
  - Put sensitive data (for example IC number or bank details) in its own DocType, with narrower read roles.
- **Set `userAccess.personId`.** `rebuildUserAccess` preserves it but nothing sets it yet. Look it up from `Person.authUid`, and rebuild on Person save.
- **Choose document owners.** `ownerPersonId` is the creator's personId. Person and Membership need a controller-level way to set the owner (a Person owns itself), so `ifOwner` rows mean "my own record".
- **Grant roles from board positions.** Add a PositionRoleMap effect alongside the RoleAssignment effect in `netlify/functions/_shared/effects.ts`.
- **Membership has an extra uniqueness rule:** at most one active membership per person. Enforce it in a controller; `unique` covers single fields only.

## Needed by M3 (Desk)
- **Organization reads only go downward.**
  - A KL member cannot read the JCI Malaysia org doc.
  - If the UI needs ancestor names, denormalise them (for example `orgTitles` on each org) or add a public org directory.
- **Forms must send complete child-table rows in stored order.** Locked child fields are compared by row index.
- **Client list queries must match the rules:** `where('orgId', '==', X)` for exact grants, and `where('orgPath', 'array-contains', X)` for subtree grants.
- **Share `resolveDocAccess` with the UI.** The Desk should gate its controls with it, using the same inputs the server uses.

## Known limits (accepted)
- A CustomField id is `<DocType>.<fieldname>` across the whole platform, so two orgs cannot reuse one fieldname on the same DocType.
- Unique claims cover only documents saved through the pipeline. The M7 migration must write claims for imported data.
- When an effect fails the API returns `500 effect_failed`; saving again retries it. There is no background retry.
- There is no GET API; reads go straight to Firestore.
- M2 has no real Firebase project. Creating the project, its service account (`FIREBASE_SERVICE_ACCOUNT`) and `firebase deploy --only firestore:rules` belong to the deployment milestone.
```

Add this section at the top of `docs/superpowers/plans/m1-followups.md`, directly under its `# ...` heading:

```markdown
> **Status after M2:**
> - Done: the lint deep subpaths, the dark-mode placeholder test, `resolveDocAccess`, the `orgScoped: false` decision (roles held anywhere), server-set `ownerPersonId` and `orgPath`, child-table field locks, `DocPerm` runtime validation, memoised child schemas, the `z.enum` cast, the deep `defineDocType` freeze, and the `naming.kind: 'field'` reqd check.
> - Still open: everything under "Known lint limits", and the "Minor" items other than the two just listed.
```

- [ ] **Step 7: Final verification**

Run: `npm run check`
Expected: PASS.

Run: `npm run test:emulator`
Expected: PASS for all seven files: `smoke`, `store`, `pipeline`, `integrity`, `access`, `resource` and `rules`.

Run: `npm run build:web`
Expected: PASS.

Run: `git status --short`
Expected: only the files listed in this task, and no `.env`.

- [ ] **Step 8: Commit**

```bash
git add scripts/seed-dev.mts package.json netlify.toml .env.example README.md .github/workflows/ci.yml docs/superpowers/plans
git commit -m "chore: dev seed, netlify dev config, CI emulator tests and M2 follow-ups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## M2 exit criteria
- `npm run check` is green: lint, typecheck (core, doctypes, ui, app, server), unit tests (core, doctypes, lint tools) and UI tests.
- `npm run test:emulator` is green. It covers the save pipeline, versions, naming, links, unique values, access sync, the HTTP function and the Firestore rules.
- `npm run build:web` succeeds, and CI runs all three.
- `firestore.rules` matches the registry, which the drift test enforces.
- The manual smoke test in Task 14 passed:
  - an Organization created through `netlify dev` has a version entry
  - a locked change is rejected

## Next plans (written after M2 lands, against the real code)
- **M3:** the Desk renderer. It covers:
  - `@jci/ui` `fields/` (a FieldControl per field type) and `desk/` (DocList, DocForm, FilterBar, Timeline, LinkPicker)
  - the DeskShell, PortalShell and AuthShell layouts
  - `/desk/[doctype]` routes, reading Firestore directly with the queries Task 13 proved and writing through `/api/resource`
  - email and Google login
- **M4:** the membership DocTypes and their controllers, plus the M4 items in `m2-followups.md`.
- **M5:** the member Portal.
- **M6:** dues generation, `/api/method`, ToyyibPay.
- **M7:** Eric migration and cutover (including unique claims), plus the real Firebase project and deployment.
