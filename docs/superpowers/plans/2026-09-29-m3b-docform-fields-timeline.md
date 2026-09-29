# M3b Implementation Plan (DocForm, field controls, version Timeline)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Desk, open any document in a form generated from its DocType, edit the fields you may edit, save through `/api/resource`, create new documents, and see the version history. It works on web and native.

**Architecture:**
- `@jci/core` gains a pure **form model**: which fields the form shows, which are editable, `dependsOn` visibility, sections, form values ↔ stored doc, and the save payload. It is built on two new `DocAccess` methods, `canReadField` and `canEditField`, so the UI gates controls with exactly the rules the server enforces. `filtersForDoc` picks the rule-safe filters for a single document's versions.
- `@jci/client` gains:
  - live stores for custom-field definitions and a document's versions;
  - error mapping from API and schema issues to per-field messages;
  - timeline formatting.
- `@jci/ui` gains:
  - `Checkbox`, `Select` and `LinkPicker`;
  - `fields/`: one `FieldControl` that dispatches per field type, including a child-table editor;
  - `desk/`: `DocForm` and `Timeline`.

  These are presentational. The app injects the data-backed Link picker through a `renderField` hook.
- `apps/app` adds `/desk/[doctype]/new` and `/desk/[doctype]/[id]`, plus a `useDocForm` hook that wires the stores, access, client-side validation (the same Zod schema as the server) and saving.

**Tech Stack:** unchanged from M3a. No new third-party packages.

Spec: `docs/superpowers/specs/2026-09-29-jci-platform-core-member-crm-design.md`
Previous plan: `docs/superpowers/plans/2026-09-29-m3a-auth-client-desk-shell.md`
Carry-overs: `docs/superpowers/plans/m3-followups.md` and `docs/superpowers/plans/m2-followups.md`

## Decisions this plan makes (read before starting)
1. **One Zod schema, two places.** Before sending, the form validates the payload with `DocAccess.schema(mode)`, which is the schema the server uses. The same error mapper turns client issues and server `422 invalid` issues into field messages, so users see the same wording either way.
2. **Only changed fields are sent on update.**
   - `formPayload` sends editable fields whose value differs from the stored doc. Custom fields go under `custom`.
   - Child tables are sent as complete rows in stored order, as the M2 follow-up requires.
   - Create sends every editable, non-empty field.
   - Non-editable fields are never sent.
3. **Editability comes from the rules.**
   - A control is editable only when the field is not `readOnly` and the caller's write permlevels include it. On create, level 0 counts whenever the caller may create.
   - Child columns are editable only when their table is.
   - The form shows only readable, non-hidden fields.
4. **Simple inputs for now.**
   - Date and Datetime are text inputs with a format hint (`YYYY-MM-DD`, ISO 8601 with offset).
   - AttachImage is an image-URL input.
   - JSON is a multiline text box.
   - Native date pickers and file upload are follow-ups.
5. **Link fields get a picker only where the rules allow listing.**
   - `LinkPicker` lists the target DocType's documents in the current Desk scope, using `listFilters`.
   - Outside that scope it shows the stored id and says the list is unavailable. The value is kept.
6. **Custom fields are loaded on the client.**
   - The query is `customFields where targetDocType == X`, which the rules allow for any role holder.
   - Definitions are then kept when their `org` is on the document's `orgPath`. For a new document that is the scope org's path; for global DocTypes, all definitions apply. This matches how the server loads them.
7. **The Timeline has no Firestore index requirement.**
   - Versions are queried with `doctype ==`, `docId ==` and the org filter that the rules need (`filtersForDoc`), limited to 100.
   - They are sorted newest-first on the client.
8. **Creating an Organization uses the scope org as the parent.**
   - The client checks create permission against the parent's path. An admin with an exact grant at that org may see **New**, but the server will refuse, because the new org is a descendant. The form shows the server's message.
   - A document id of `new` is shadowed by the `/desk/[doctype]/new` route. No DocType names documents `new`.
9. **Out of scope:** delete, tabs, concurrent-edit detection, and native date pickers. All are recorded in `m3-followups.md` (Task 7).

## Global Constraints
- Repo root: `C:\Users\User\Documents\Cursor projects\Frappe`. All paths below are relative to it.
- Commands use Git Bash syntax, run from the repo root unless a step says otherwise.
- Work on branch `m3b-docform`, which the controller creates from `main`. Do not switch branches.
- **JDK 21 is not on PATH in this environment.** Start every Bash command that runs `firebase`, `npm run emulators`, `npm run test:emulator`, `npm run seed:dev` or `npm run dev:api` with:
  `export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot"; export PATH="$JAVA_HOME/bin:$PATH";`
- **Hard rule from M1, unchanged:** app code (`apps/app`, `packages/doctypes`) builds its UI only from `@jci/ui`.
  - React Native view primitives, NativeWind and `className`/`style` props may be used only inside `packages/ui`.
  - App code may import non-visual `react-native` APIs and `expo-router`.
- No hex colour literals anywhere except `packages/ui/src/tokens/tokens.json`.
- `@jci/ui` components:
  - take semantic props, never `className` or `style`;
  - use literal Tailwind class strings (lookup maps);
  - have touch targets of at least 44 px (`min-h-11`);
  - set `accessibilityRole` and `accessibilityLabel` when interactive;
  - show web focus rings;
  - get a gallery entry.
- Colours are semantic token pairs (`bg-surface dark:bg-surface-dark`). A new colour means a new token in `tokens.json`, in both `light` and `dark`.
- `@jci/ui` may import **types** from `@jci/core` (`import type`), but never runtime code. It stays free of Firebase and of data access.
- Roles: `SystemManager, OrgAdmin, MembershipOfficer, Treasurer, BoardMember, Member, Guest`.
- `orgPath` lists ancestor ids and ends with the org's own id.
- Emulator ports: Firestore `8080`, Auth `9099`. The API (`npm run dev:api`) runs on `8888`; Expo web runs on `8081`.
- Dev accounts exist only in the emulator, with password `jci-dev-password`:
  - `admin@jci.test`: SystemManager at `jci`, subtree
  - `member@jci.test`: Member at `jci-kl`, exact
- Commit after every task. End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never use another model name.
- If `npm run typecheck` fails only on route names, the gitignored `apps/app/.expo/types` is stale. Delete it and rerun. Never change code to work around it.

## File Structure (end state of M3b)
```
packages/core/src/perm/access.ts          + DocAccess.canReadField, canEditField
packages/core/src/perm/listScope.ts       + filtersForDoc
packages/core/src/form/formModel.ts (+ .test.ts)   FormField, formFields, visibleFormFields, sectionsOf, formValues, formPayload
packages/client/src/formErrors.ts (+ .test.ts)     FormErrors, formErrorsFromIssues, formErrorsFrom
packages/client/src/timeline.ts (+ .test.ts)       timelineEntries, formatValue
packages/client/src/stores.ts             + createVersionsStore, createCustomFieldsStore, VERSIONS_LIMIT
packages/client/src/react.tsx             + useVersions, useCustomFields
packages/ui/src/tokens/tokens.json        + scrim
packages/ui/src/components/{Checkbox,Select,LinkPicker,PickerSheet}.tsx   Input.tsx + multiline
packages/ui/src/fields/{types,FieldControl,TextField,NumberField,JsonField,CheckField,SelectField,ChildTable,hints}.ts(x)
packages/ui/src/desk/{DocForm,Timeline}.tsx
packages/ui/src/{components,fields,desk}/__tests__/*.test.tsx
apps/app/src/desk/{titles.ts,useScopeOrgPath.ts,useDocForm.ts,LinkField.tsx,DocFormScreen.tsx}
apps/app/app/(desk)/desk/[doctype]/{index,new,[id]}.tsx
apps/app/app/(dev)/gallery-doc-form.tsx
tests/emulator/formData.test.ts
docs/superpowers/plans/m3-followups.md    + M3b section
```

---

### Task 1: Form model and field-level access in `@jci/core`

**Files:**
- Modify: `packages/core/src/perm/access.ts` (`DocAccess` interface plus two methods)
- Modify: `packages/core/src/perm/listScope.ts` (add `filtersForDoc`)
- Create: `packages/core/src/form/formModel.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/form/formModel.test.ts`, `packages/core/src/perm/listScope.test.ts` (append)

**Interfaces:**
- Consumes:
  - `resolveDocAccess`, `DocAccess`, `getFieldValue` (perm/access.ts)
  - `permittedLevels` (perm/evaluate.ts)
  - `fieldKey` (meta/customFields.ts)
  - `deepEqual` (diff/diffDocs.ts)
  - `listFilters`, `scopeOptions`, `ScopeOption`, `ListFilter` (perm/listScope.ts)
- Produces:

```ts
// DocAccess gains:
canReadField(field: FieldDef): boolean                    // caller's read permlevels include the field's permlevel
canEditField(field: FieldDef, isNew: boolean): boolean    // not readOnly, and write levels (plus level 0 on create when canCreate) include it
// listScope.ts:
function filtersForDoc(meta: DocTypeMeta, user: UserContext, doc: { orgId?: unknown; orgPath?: unknown; ownerPersonId?: unknown }): ListFilter[] | null
// form/formModel.ts:
interface FormField { def: FieldDef; key: string; editable: boolean; children: FormField[] | null }
interface FormSection { title: string | null; fields: FormField[] }
type FormValues = Record<string, unknown>
function formFields(access: DocAccess, resolveChild: (name: string) => DocTypeMeta, isNew: boolean): FormField[]
function visibleFormFields(fields: readonly FormField[], values: FormValues): FormField[]
function sectionsOf(fields: readonly FormField[]): FormSection[]
function formValues(fields: readonly FormField[], doc: Record<string, unknown> | null): FormValues
function formPayload(fields: readonly FormField[], values: FormValues, before: Record<string, unknown> | null): Record<string, unknown>
```

What each function does:
- `filtersForDoc` returns the `listFilters` result for the first scope option that covers the document:
  - an exact option whose org is the doc's `orgId`;
  - or a subtree option whose org is on the doc's `orgPath`.
- A global DocType ignores the doc.
- It returns null when no option covers the document.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/form/formModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defineDocType } from '../meta/defineDocType';
import type { FieldDef } from '../meta/types';
import { resolveDocAccess } from '../perm/access';
import type { UserContext } from '../perm/evaluate';
import { formFields, formPayload, formValues, sectionsOf, visibleFormFields, type FormField } from './formModel';

const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];

const duesRow = defineDocType({
  name: 'DuesRow',
  module: 't',
  isChild: true,
  fields: [
    { fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true },
    { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', permlevel: 1 },
    { fieldname: 'secret', label: 'Secret', fieldtype: 'Data', permlevel: 2 },
  ],
});
const person = defineDocType({
  name: 'Person',
  module: 't',
  collection: 'persons',
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data', reqd: true, section: 'Basics' },
    { fieldname: 'nickname', label: 'Nickname', fieldtype: 'Data', section: 'Basics' },
    { fieldname: 'hasCar', label: 'Has a car', fieldtype: 'Check', section: 'Extra' },
    { fieldname: 'carPlate', label: 'Car plate', fieldtype: 'Data', section: 'Extra', dependsOn: { field: 'hasCar' } },
    { fieldname: 'kind', label: 'Kind', fieldtype: 'Select', options: ['A', 'B'], section: 'Extra' },
    { fieldname: 'bNote', label: 'B note', fieldtype: 'Data', section: 'Extra', dependsOn: { field: 'kind', equals: 'B' } },
    { fieldname: 'membershipType', label: 'Type', fieldtype: 'Select', options: ['Probation', 'Official'], permlevel: 1 },
    { fieldname: 'authUid', label: 'Auth UID', fieldtype: 'Data', readOnly: true },
    { fieldname: 'internal', label: 'Internal', fieldtype: 'Data', hidden: true },
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
const shirt: FieldDef = { fieldname: 'shirtSize', label: 'Shirt size', fieldtype: 'Data', permlevel: 1 };

const member: UserContext = { uid: 'u1', personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] };
const officer: UserContext = { uid: 'u2', personId: 'p2', grants: [{ role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true }] };
const treasurer: UserContext = { uid: 'u3', personId: 'p3', grants: [{ role: 'Treasurer', orgId: 'jci-kl', withDescendants: false }] };
const access = (user: UserContext, ownerPersonId = 'p1') =>
  resolveDocAccess({ meta: person, customFields: [shirt], user, doc: { orgPath: KL, ownerPersonId }, resolveChild });
const byKey = (fields: readonly FormField[]) => Object.fromEntries(fields.map((f) => [f.key, f]));

const stored = {
  id: 'P1',
  orgId: 'jci-kl',
  orgPath: KL,
  ownerPersonId: 'p1',
  fullName: 'Tan',
  nickname: 'AK',
  hasCar: true,
  carPlate: 'WXY 1',
  membershipType: 'Probation',
  authUid: 'abc',
  internal: 'x',
  dues: [{ year: 2025, amount: 350, secret: 's' }],
  custom: { shirtSize: 'M' },
};

describe('field-level access', () => {
  it('reports readable and editable fields from the permission rows', () => {
    const a = access(member);
    const type = person.fields.find((f) => f.fieldname === 'membershipType')!;
    const uid = person.fields.find((f) => f.fieldname === 'authUid')!;
    expect(a.canReadField(type)).toBe(true);
    expect(a.canEditField(type, false)).toBe(false);
    expect(a.canEditField(uid, false)).toBe(false);
    expect(access(officer).canEditField(type, false)).toBe(true);
    expect(a.canReadField(duesRow.fields[2]!)).toBe(false);
  });

  it('lets a create-only role fill level-0 fields on create only', () => {
    const a = access(treasurer, 'p3');
    const name = person.fields[0]!;
    expect(a.canEditField(name, true)).toBe(true);
    expect(a.canEditField(name, false)).toBe(false);
  });
});

describe('formFields', () => {
  it('lists readable, non-hidden fields with custom keys and child columns', () => {
    const fields = formFields(access(member), resolveChild, false);
    expect(fields.map((f) => f.key)).toEqual([
      'fullName',
      'nickname',
      'hasCar',
      'carPlate',
      'kind',
      'bNote',
      'membershipType',
      'authUid',
      'dues',
      'custom.shirtSize',
    ]);
    const f = byKey(fields);
    expect(f.fullName!.editable).toBe(true);
    expect(f.membershipType!.editable).toBe(false);
    expect(f.authUid!.editable).toBe(false);
    expect(f['custom.shirtSize']!.editable).toBe(false);
    expect(f.dues!.children!.map((c) => [c.key, c.editable])).toEqual([
      ['year', true],
      ['amount', false],
    ]);
    expect(f.fullName!.children).toBeNull();
  });

  it('makes nothing editable for a reader without write access', () => {
    const fields = formFields(access(member, 'p9'), resolveChild, false);
    expect(fields.every((f) => !f.editable)).toBe(true);
    expect(byKey(fields).dues!.children!.every((c) => !c.editable)).toBe(true);
  });
});

describe('visibleFormFields and sectionsOf', () => {
  it('applies dependsOn and groups fields by section in order', () => {
    const fields = formFields(access(officer, 'p1'), resolveChild, false);
    const hidden = visibleFormFields(fields, { hasCar: false, kind: 'A' }).map((f) => f.key);
    expect(hidden).not.toContain('carPlate');
    expect(hidden).not.toContain('bNote');
    const shown = visibleFormFields(fields, { hasCar: true, kind: 'B' }).map((f) => f.key);
    expect(shown).toContain('carPlate');
    expect(shown).toContain('bNote');
    expect(sectionsOf(fields).map((s) => [s.title, s.fields.length])).toEqual([
      ['Basics', 2],
      ['Extra', 4],
      [null, 4],
    ]);
  });
});

describe('formValues and formPayload', () => {
  const officerFields = formFields(access(officer, 'p1'), resolveChild, false);

  it('reads flat values, with null for missing and copies of child rows', () => {
    const values = formValues(officerFields, stored);
    expect(values).toMatchObject({ fullName: 'Tan', kind: null, 'custom.shirtSize': 'M', dues: [{ year: 2025, amount: 350, secret: 's' }] });
    expect(values.dues).not.toBe(stored.dues);
    expect(formValues(officerFields, null)).toMatchObject({ fullName: null, dues: [] });
  });

  it('sends only editable fields that changed on update, with custom values nested', () => {
    const values = { ...formValues(officerFields, stored), nickname: 'Ah Kow', authUid: 'hacked', 'custom.shirtSize': 'L' };
    expect(formPayload(officerFields, values, stored)).toEqual({ nickname: 'Ah Kow', custom: { shirtSize: 'L' } });
    expect(formPayload(officerFields, formValues(officerFields, stored), stored)).toEqual({});
  });

  it('sends every non-empty editable field on create and turns optional blanks into omissions', () => {
    const createFields = formFields(access(officer, 'p2'), resolveChild, true);
    const values = { ...formValues(createFields, null), fullName: 'New', nickname: '', kind: 'A', dues: [{ year: 2026 }] };
    expect(formPayload(createFields, values, null)).toEqual({ fullName: 'New', kind: 'A', dues: [{ year: 2026 }] });
  });

  it('keeps an empty required value so validation can report it', () => {
    const createFields = formFields(access(officer, 'p2'), resolveChild, true);
    expect(formPayload(createFields, { ...formValues(createFields, null), fullName: '' }, null)).toMatchObject({ fullName: '' });
  });

  it('sends a changed child table as complete rows', () => {
    const values = { ...formValues(officerFields, stored), dues: [{ year: 2025, amount: 400, secret: 's' }] };
    expect(formPayload(officerFields, values, stored)).toEqual({ dues: [{ year: 2025, amount: 400, secret: 's' }] });
  });
});
```

Append to `packages/core/src/perm/listScope.test.ts`, and add `filtersForDoc` to its `./listScope` import:

```ts
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core`
Expected: FAIL. `./formModel` cannot be resolved, and `filtersForDoc`, `canReadField` and `canEditField` do not exist.

- [ ] **Step 3: Add the field-level access methods**

In `packages/core/src/perm/access.ts`:

1. Add these two members to the `DocAccess` interface, after `readableFields`:

```ts
  /** The caller may read this field (core, custom or child column): its permlevel is among their read levels. */
  canReadField(field: FieldDef): boolean;
  /** The caller may set this field: not readOnly, and its permlevel is among their write levels (plus level 0 on create). */
  canEditField(field: FieldDef, isNew: boolean): boolean;
```

2. In `resolveDocAccess`:
   - Add `const readLevels = permittedLevels(meta, user, 'read', doc);` after the `writeLevels` line.
   - Add `const levelsFor = (isNew: boolean) => (isNew && canCreate ? new Set([0, ...writeLevels]) : writeLevels);` after it.
   - Add these two methods to the returned object, after `readableFields: readable,`:

```ts
    canReadField: (field) => readLevels.has(field.permlevel ?? 0),
    canEditField: (field, isNew) => !isLocked(field, levelsFor(isNew)),
```

3. In the same function, simplify the existing code to reuse the new helpers:
   - In `unwritableKeys`, replace `const levels = before === null && canCreate ? new Set([0, ...writeLevels]) : writeLevels;` with `const levels = levelsFor(before === null);`. Keep the comment above it.
   - In `redact`, delete the `const readLevels = permittedLevels(meta, user, 'read', doc);` line. It now uses the outer `readLevels`.

- [ ] **Step 4: Add `filtersForDoc`**

Append to `packages/core/src/perm/listScope.ts`:

```ts
/**
 * Rule-safe filters that include one stored document: listFilters for the first scope option that covers it
 * (an exact option at its org, or a subtree option on its orgPath). Null when no option covers it.
 */
export function filtersForDoc(
  meta: DocTypeMeta,
  user: UserContext,
  doc: { orgId?: unknown; orgPath?: unknown },
): ListFilter[] | null {
  if (!meta.orgScoped) return listFilters(meta, user, null);
  const orgPath = Array.isArray(doc.orgPath) ? (doc.orgPath as unknown[]) : [];
  for (const option of scopeOptions(user)) {
    const covers = option.withDescendants ? orgPath.includes(option.orgId) : doc.orgId === option.orgId;
    if (!covers) continue;
    const filters = listFilters(meta, user, option);
    if (filters) return filters;
  }
  return null;
}
```

The owner filter comes from `listFilters` itself, using `user.personId`. The test with `ownerPersonId: 'p1'` checks that it matches the caller.

- [ ] **Step 5: Write the form model**

Create `packages/core/src/form/formModel.ts`:

```ts
import { deepEqual } from '../diff/diffDocs';
import { fieldKey } from '../meta/customFields';
import type { DocTypeMeta, FieldDef } from '../meta/types';
import { getFieldValue, type DocAccess } from '../perm/access';

/** A field as the Desk form shows it. `key` is where its value lives in form values: 'name' or 'custom.name'. */
export interface FormField {
  def: FieldDef;
  key: string;
  editable: boolean;
  /** Child-table columns the caller may read (Table fields only); null for other field types. */
  children: FormField[] | null;
}

export interface FormSection {
  title: string | null;
  fields: FormField[];
}

/** Form state, keyed by FormField.key. Table values are arrays of row objects keyed by child fieldname. */
export type FormValues = Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Readable, non-hidden fields in DocType order (custom fields last), with editability from the caller's permissions. */
export function formFields(access: DocAccess, resolveChild: (name: string) => DocTypeMeta, isNew: boolean): FormField[] {
  return access.readableFields
    .filter((def) => def.hidden !== true)
    .map((def) => {
      const editable = access.canEditField(def, isNew);
      const children =
        def.fieldtype === 'Table'
          ? resolveChild(def.childDocType!)
              .fields.filter((cf) => cf.hidden !== true && access.canReadField(cf))
              .map((cf) => ({ def: cf, key: cf.fieldname, editable: editable && access.canEditField(cf, isNew), children: null }))
          : null;
      return { def, key: fieldKey(def), editable, children };
    });
}

/** Drops fields whose dependsOn condition is not met by the current values. */
export function visibleFormFields(fields: readonly FormField[], values: FormValues): FormField[] {
  return fields.filter((f) => {
    const dep = f.def.dependsOn;
    if (!dep) return true;
    const v = values[dep.field] ?? null;
    if (dep.equals !== undefined) return deepEqual(v, dep.equals);
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });
}

/** Groups fields by `section`, in the order each section first appears. Fields without one share a null section. */
export function sectionsOf(fields: readonly FormField[]): FormSection[] {
  const sections: FormSection[] = [];
  for (const f of fields) {
    const title = f.def.section ?? null;
    let section = sections.find((s) => s.title === title);
    if (!section) {
      section = { title, fields: [] };
      sections.push(section);
    }
    section.fields.push(f);
  }
  return sections;
}

/** Form values for a stored document (or a new one): missing values are null, tables are copied row by row. */
export function formValues(fields: readonly FormField[], doc: Record<string, unknown> | null): FormValues {
  const values: FormValues = {};
  for (const f of fields) {
    const v = getFieldValue(doc, f.key);
    values[f.key] = f.def.fieldtype === 'Table' ? (Array.isArray(v) ? v.map((row) => (isRecord(row) ? { ...row } : {})) : []) : v;
  }
  return values;
}

/**
 * The body to send: editable fields only. On create (`before` null), every non-empty value; on update, only
 * values that differ from `before`. Optional blanks become null; custom values nest under `custom`;
 * tables are sent as complete rows.
 */
export function formPayload(fields: readonly FormField[], values: FormValues, before: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.editable) continue;
    let v = values[f.key] ?? null;
    if (v === '' && f.def.reqd !== true) v = null;
    const unchanged = before === null ? v === null : deepEqual(v, getFieldValue(before, f.key));
    if (unchanged) continue;
    if (f.key.startsWith('custom.')) custom[f.def.fieldname] = v;
    else out[f.key] = v;
  }
  if (Object.keys(custom).length > 0) out.custom = custom;
  return out;
}
```

In `packages/core/src/index.ts`, add after `export * from './perm/listScope';`:

```ts
export * from './form/formModel';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/core`
Expected: PASS, including all earlier core tests. `access.test.ts` covers the `unwritableKeys` and `redact` refactor.

- [ ] **Step 7: Run the checks and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add packages/core
git commit -m "feat(core): form model with rule-based field editability and per-document filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Client data for forms: custom fields, versions, error mapping, timeline formatting

**Files:**
- Create: `packages/client/src/formErrors.ts`, `packages/client/src/timeline.ts`
- Modify: `packages/client/src/stores.ts`, `packages/client/src/react.tsx`, `packages/client/src/index.ts`
- Test: `packages/client/src/formErrors.test.ts`, `packages/client/src/timeline.test.ts`, `tests/emulator/formData.test.ts`

**Interfaces:**
- Consumes:
  - `ApiRequestError` (api.ts); `createStore`, `Store`, `QueryDoc`, `DocsState`, `constantStore`
  - `VERSIONS_COLLECTION`, `ListFilter`, `filtersForDoc`, `buildUserAccess` (core)
  - `Organization` (`@jci/doctypes`)
  - emulator helpers `testProject`, `clearAuth`, `signUp`, `requireEmulators` and fixture `seedOrgs`
- Produces:

```ts
interface FormErrors { fields: Record<string, string>; form: string | null }
interface Issue { path: string; message: string }
function formErrorsFromIssues(issues: readonly Issue[]): FormErrors
function formErrorsFrom(err: unknown): FormErrors
interface TimelineChange { label: string; from: string; to: string }
interface TimelineEntry { id: string; action: string; by: string; at: Date | null; changes: TimelineChange[] }
function formatValue(value: unknown): string
function timelineEntries(docs: readonly QueryDoc[], labels: Readonly<Record<string, string>>): TimelineEntry[]   // newest first
const VERSIONS_LIMIT: 100
function createVersionsStore(db: Firestore, doctype: string, docId: string, orgFilters: readonly ListFilter[], max?: number): Store<DocsState>
function createCustomFieldsStore(db: Firestore, collectionName: string, targetDocType: string): Store<DocsState>
// react.tsx:
function useVersions(doctype: string | null, docId: string | null, orgFilters: readonly ListFilter[] | null): DocsState   // null input → ready, []
function useCustomFields(collectionName: string, targetDocType: string | null): DocsState
```

Error mapping rules:
- An issue path `''` becomes the form error.
- `custom.x` stays `custom.x`.
- `history.0.org` becomes field `history`, with the message prefixed `Row 1, org: `.
- For `ApiRequestError`:
  - `invalid` maps its issues.
  - `field_not_writable` gives each listed field "You cannot change this field.", and the form error is the server message.
  - `duplicate` gives each listed field "Another record already uses this value."
  - Any other code puts `err.message` on the form.
- Non-API errors put "Something went wrong. Please try again." on the form.

- [ ] **Step 1: Write the failing unit tests**

Create `packages/client/src/formErrors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './api';
import { formErrorsFrom, formErrorsFromIssues } from './formErrors';

describe('formErrorsFromIssues', () => {
  it('maps issue paths to field keys, keeping the first message per field', () => {
    expect(
      formErrorsFromIssues([
        { path: 'fullName', message: 'Required' },
        { path: 'fullName', message: 'Too long' },
        { path: 'custom.shirtSize', message: 'Invalid option' },
        { path: 'dues.0.year', message: 'Expected number' },
        { path: '', message: 'Unrecognized key: "x"' },
      ]),
    ).toEqual({
      fields: { fullName: 'Required', 'custom.shirtSize': 'Invalid option', dues: 'Row 1, year: Expected number' },
      form: 'Unrecognized key: "x"',
    });
  });
});

describe('formErrorsFrom', () => {
  it('maps a 422 from the API', () => {
    const err = new ApiRequestError(422, 'invalid', 'The level cannot change', { issues: [{ path: 'level', message: 'The level cannot change' }] });
    expect(formErrorsFrom(err)).toEqual({ fields: { level: 'The level cannot change' }, form: null });
  });

  it('falls back to the message when a 422 has no usable issues', () => {
    expect(formErrorsFrom(new ApiRequestError(422, 'invalid', 'Validation failed', { issues: 'nope' }))).toEqual({
      fields: {},
      form: 'Validation failed',
    });
  });

  it('marks locked and duplicate fields', () => {
    const locked = new ApiRequestError(403, 'field_not_writable', 'You cannot change some of these fields', { fields: ['membershipType', 'dues.amount'] });
    expect(formErrorsFrom(locked)).toEqual({
      fields: { membershipType: 'You cannot change this field.', dues: 'You cannot change this field.' },
      form: 'You cannot change some of these fields',
    });
    const dup = new ApiRequestError(409, 'duplicate', 'Another document already uses this value', { fields: ['email'] });
    expect(formErrorsFrom(dup)).toEqual({ fields: { email: 'Another record already uses this value.' }, form: null });
  });

  it('shows other failures on the form', () => {
    expect(formErrorsFrom(new ApiRequestError(403, 'forbidden', 'You cannot edit this Person'))).toEqual({ fields: {}, form: 'You cannot edit this Person' });
    expect(formErrorsFrom(new Error('boom'))).toEqual({ fields: {}, form: 'Something went wrong. Please try again.' });
  });
});
```

Create `packages/client/src/timeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatValue, timelineEntries } from './timeline';

describe('formatValue', () => {
  it('renders values for people', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue('')).toBe('—');
    expect(formatValue(true)).toBe('Yes');
    expect(formatValue(false)).toBe('No');
    expect(formatValue(12.5)).toBe('12.5');
    expect(formatValue('JCI KL')).toBe('JCI KL');
    expect(formatValue([{}, {}])).toBe('2 rows');
    expect(formatValue([{}])).toBe('1 row');
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe('timelineEntries', () => {
  it('labels changes, reads Timestamp-like dates and sorts newest first', () => {
    const older = { toDate: () => new Date('2026-09-01T00:00:00Z') };
    const newer = { toDate: () => new Date('2026-09-29T00:00:00Z') };
    const entries = timelineEntries(
      [
        { id: 'v1', data: { action: 'create', by: 'u1', at: older, changed: [{ field: 'title', old: null, new: 'JCI KL' }] } },
        { id: 'v2', data: { action: 'update', by: 'u2', at: newer, changed: [{ field: 'custom.motto', old: 'Old', new: 'New' }, 'junk'] } },
      ],
      { title: 'Name', 'custom.motto': 'Motto' },
    );
    expect(entries).toEqual([
      { id: 'v2', action: 'update', by: 'u2', at: new Date('2026-09-29T00:00:00Z'), changes: [{ label: 'Motto', from: 'Old', to: 'New' }] },
      { id: 'v1', action: 'create', by: 'u1', at: new Date('2026-09-01T00:00:00Z'), changes: [{ label: 'Name', from: '—', to: 'JCI KL' }] },
    ]);
  });

  it('falls back to the raw field name and tolerates missing data', () => {
    expect(timelineEntries([{ id: 'v', data: {} }], {})).toEqual([{ id: 'v', action: 'update', by: '', at: null, changes: [] }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/client`
Expected: FAIL, because `./formErrors` and `./timeline` cannot be resolved.

- [ ] **Step 3: Implement error mapping and timeline formatting**

Create `packages/client/src/formErrors.ts`:

```ts
import { ApiRequestError } from './api';

export interface FormErrors {
  /** Messages keyed by form field key ('name' or 'custom.name'); child-row issues land on their table. */
  fields: Record<string, string>;
  form: string | null;
}

export interface Issue {
  path: string;
  message: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIssue = (v: unknown): v is Issue => isRecord(v) && typeof v.path === 'string' && typeof v.message === 'string';

/** The form field an issue path belongs to: 'custom.x' stays, 'dues.0.year' belongs to 'dues'. */
function fieldOf(path: string): string {
  const parts = path.split('.');
  return parts[0] === 'custom' && parts.length > 1 ? `custom.${parts[1]}` : parts[0]!;
}

function rowPrefix(path: string): string {
  const m = /^[^.]+\.(\d+)\.([^.]+)/.exec(path);
  return m && !path.startsWith('custom.') ? `Row ${Number(m[1]) + 1}, ${m[2]}: ` : '';
}

export function formErrorsFromIssues(issues: readonly Issue[]): FormErrors {
  const fields: Record<string, string> = {};
  let form: string | null = null;
  for (const issue of issues) {
    if (issue.path === '') {
      form ??= issue.message;
      continue;
    }
    fields[fieldOf(issue.path)] ??= `${rowPrefix(issue.path)}${issue.message}`;
  }
  return { fields, form };
}

function markFields(keys: unknown, message: string): Record<string, string> {
  const fields: Record<string, string> = {};
  if (Array.isArray(keys)) for (const k of keys) if (typeof k === 'string') fields[fieldOf(k)] = message;
  return fields;
}

/** Messages for a failed save, from the API's error shape. */
export function formErrorsFrom(err: unknown): FormErrors {
  if (!(err instanceof ApiRequestError)) return { fields: {}, form: 'Something went wrong. Please try again.' };
  const details = isRecord(err.details) ? err.details : {};
  if (err.code === 'invalid' && Array.isArray(details.issues)) {
    const mapped = formErrorsFromIssues(details.issues.filter(isIssue));
    const hasFieldErrors = Object.keys(mapped.fields).length > 0;
    return { fields: mapped.fields, form: mapped.form ?? (hasFieldErrors ? null : err.message) };
  }
  if (err.code === 'field_not_writable') return { fields: markFields(details.fields, 'You cannot change this field.'), form: err.message };
  if (err.code === 'duplicate') return { fields: markFields(details.fields, 'Another record already uses this value.'), form: null };
  return { fields: {}, form: err.message };
}
```

Create `packages/client/src/timeline.ts`:

```ts
import type { QueryDoc } from './stores';

export interface TimelineChange {
  label: string;
  from: string;
  to: string;
}

export interface TimelineEntry {
  id: string;
  action: string;
  by: string;
  at: Date | null;
  changes: TimelineChange[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Firestore Timestamps (anything with toDate), Dates and ISO strings. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (isRecord(value) && typeof value.toDate === 'function') return (value as { toDate(): Date }).toDate();
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'row' : 'rows'}`;
  return JSON.stringify(value);
}

/** Version documents as timeline entries, newest first. `labels` maps field keys to their labels. */
export function timelineEntries(docs: readonly QueryDoc[], labels: Readonly<Record<string, string>>): TimelineEntry[] {
  return docs
    .map((d) => {
      const changed = Array.isArray(d.data.changed) ? d.data.changed : [];
      return {
        id: d.id,
        action: typeof d.data.action === 'string' ? d.data.action : 'update',
        by: typeof d.data.by === 'string' ? d.data.by : '',
        at: toDate(d.data.at),
        changes: changed.filter(isRecord).map((c) => ({
          label: labels[String(c.field)] ?? String(c.field),
          from: formatValue(c.old),
          to: formatValue(c.new),
        })),
      };
    })
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npx vitest run packages/client`
Expected: PASS.

- [ ] **Step 5: Write the failing emulator test for the new stores**

Create `tests/emulator/formData.test.ts`:

```ts
import { createCustomFieldsStore, createVersionsStore, initClient, signInWithEmail, signOutUser, timelineEntries, type DocsState, type Store } from '@jci/client';
import { buildUserAccess, filtersForDoc } from '@jci/core';
import { Organization } from '@jci/doctypes';
import { deleteApp } from 'firebase/app';
import { Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KL, PJ, seedOrgs } from './fixtures';
import { clearAuth, requireEmulators, signUp, testProject } from './helpers';

// Sign-up tokens come from the Auth emulator's default project, so this file uses demo-jci (files run one at a time).
const admin = testProject('demo-jci');
const client = initClient({
  projectId: 'demo-jci',
  apiKey: 'demo-api-key',
  emulatorHost: requireEmulators().firestoreHost.split(':')[0]!,
  apiBaseUrl: 'http://localhost:8888',
  appName: 'form-data-test',
});
const EMAIL = 'form-member@jci.test';
const member = { uid: '', personId: 'p-member', grants: [{ role: 'Member' as const, orgId: 'jci-kl', withDescendants: false }] };

function settle(store: Store<DocsState>): Promise<DocsState> {
  return new Promise((resolve) => {
    const check = () => {
      const s = store.getSnapshot();
      if (s.status === 'loading') return;
      queueMicrotask(() => unsubscribe());
      resolve(s);
    };
    const unsubscribe = store.subscribe(check);
    check();
  });
}

beforeAll(async () => {
  await admin.clear();
  await clearAuth(admin.projectId);
  await seedOrgs(admin.db);
  ({ uid: member.uid } = await signUp(EMAIL));
  await admin.db.collection('userAccess').doc(member.uid).set(buildUserAccess(member.uid, member.personId, member.grants));
  const version = (docId: string, orgPath: string[], at: string, title: string) => ({
    doctype: 'Organization',
    docId,
    action: 'update',
    by: 'u-admin',
    at: Timestamp.fromDate(new Date(at)),
    changed: [{ field: 'title', old: 'Old', new: title }],
    orgId: orgPath[orgPath.length - 1],
    orgPath,
    ownerPersonId: null,
  });
  await admin.db.collection('versions').doc('v1').set(version('jci-kl', KL, '2026-09-01T00:00:00Z', 'First'));
  await admin.db.collection('versions').doc('v2').set(version('jci-kl', KL, '2026-09-29T00:00:00Z', 'Second'));
  await admin.db.collection('versions').doc('v3').set(version('jci-pj', PJ, '2026-09-29T00:00:00Z', 'PJ'));
  await admin.db
    .collection('customFields')
    .doc('Organization.motto')
    .set({ targetDocType: 'Organization', fieldname: 'motto', label: 'Motto', fieldtype: 'Data', org: 'jci-malaysia' });
  await admin.db
    .collection('customFields')
    .doc('RoleAssignment.note')
    .set({ targetDocType: 'RoleAssignment', fieldname: 'note', label: 'Note', fieldtype: 'Data', org: 'jci' });
  await signInWithEmail(client, EMAIL, 'emulator-only-password');
});

afterAll(async () => {
  await signOutUser(client).catch(() => {});
  await deleteApp(client.app);
  await admin.close();
});

describe('form data stores against the generated rules', () => {
  it('lists a document versions with the filters for that document, newest first', async () => {
    const filters = filtersForDoc(Organization, member, { orgId: 'jci-kl', orgPath: KL })!;
    const state = await settle(createVersionsStore(client.db, 'Organization', 'jci-kl', filters));
    expect(state.status).toBe('ready');
    const entries = timelineEntries(state.status === 'ready' ? state.docs : [], { title: 'Name' });
    expect(entries.map((e) => e.changes[0]!.to)).toEqual(['Second', 'First']);
  });

  it('has no filters for a document outside the caller scope, and the rules deny a guessed query', async () => {
    expect(filtersForDoc(Organization, member, { orgId: 'jci-pj', orgPath: PJ })).toBeNull();
    const guessed = await settle(createVersionsStore(client.db, 'Organization', 'jci-pj', [{ field: 'orgId', op: '==', value: 'jci-pj' }]));
    expect(guessed.status).toBe('error');
  });

  it('loads the custom field definitions for one DocType', async () => {
    const state = await settle(createCustomFieldsStore(client.db, 'customFields', 'Organization'));
    expect(state.status === 'ready' && state.docs.map((d) => d.id)).toEqual(['Organization.motto']);
  });
});
```

Run (Java prefix first): `npm run test:emulator`
Expected: FAIL in `formData.test.ts`, because `createVersionsStore`, `createCustomFieldsStore` and `timelineEntries` are not exported yet.

- [ ] **Step 6: Add the stores and hooks**

In `packages/client/src/stores.ts`:
- Change the core import to `import { USER_ACCESS_COLLECTION, userContextFromAccess, VERSIONS_COLLECTION, type ListFilter, type UserContext } from '@jci/core';`.
- Append:

```ts
/** Most version entries loaded for one document. */
export const VERSIONS_LIMIT = 100;

/**
 * A document's version entries (unsorted; see timelineEntries). `orgFilters` come from filtersForDoc, so the
 * query carries the doctype, docId and org constraints the versions rule needs. No composite index required.
 */
export function createVersionsStore(
  db: Firestore,
  doctype: string,
  docId: string,
  orgFilters: readonly ListFilter[],
  max = VERSIONS_LIMIT,
): Store<DocsState> {
  const q = query(
    collection(db, VERSIONS_COLLECTION),
    where('doctype', '==', doctype),
    where('docId', '==', docId),
    ...orgFilters.map((f) => where(f.field, f.op, f.value)),
    limit(max),
  );
  return createStore<DocsState>({ status: 'loading' }, (set) =>
    onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache) return; // server-confirmed only, like every other store
        set({ status: 'ready', docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })) });
      },
      (err) => set({ status: 'error', message: err.message }),
    ),
  );
}

/** Custom field definitions for one DocType. CustomField is global, so any role holder may run this query. */
export function createCustomFieldsStore(db: Firestore, collectionName: string, targetDocType: string): Store<DocsState> {
  const q = query(collection(db, collectionName), where('targetDocType', '==', targetDocType));
  return createStore<DocsState>({ status: 'loading' }, (set) =>
    onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache) return; // server-confirmed only, like every other store
        set({ status: 'ready', docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })) });
      },
      (err) => set({ status: 'error', message: err.message }),
    ),
  );
}
```

In `packages/client/src/react.tsx`:
- Add `createCustomFieldsStore` and `createVersionsStore` to the `./stores` import.
- Append:

```tsx
/** A document's version entries. Pass the filters from filtersForDoc; null means nothing to load. */
export function useVersions(doctype: string | null, docId: string | null, orgFilters: readonly ListFilter[] | null): DocsState {
  const { client } = useClient();
  const key = orgFilters ? JSON.stringify(orgFilters) : null;
  const store = useMemo(
    () => (doctype && docId && key !== null ? createVersionsStore(client.db, doctype, docId, JSON.parse(key) as ListFilter[]) : NO_DOCS),
    [client, doctype, docId, key],
  );
  return useStore(store);
}

export function useCustomFields(collectionName: string, targetDocType: string | null): DocsState {
  const { client } = useClient();
  const store = useMemo(
    () => (targetDocType ? createCustomFieldsStore(client.db, collectionName, targetDocType) : NO_DOCS),
    [client, collectionName, targetDocType],
  );
  return useStore(store);
}
```

In `packages/client/src/index.ts`, add:

```ts
export * from './formErrors';
export * from './timeline';
```

- [ ] **Step 7: Run the tests to verify they pass**

Run (Java prefix first): `npm run test:emulator`
Expected: PASS for every file, including the 3 new `formData` tests.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/client tests/emulator/formData.test.ts
git commit -m "feat(client): custom field and version stores, form error mapping, timeline formatting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: `@jci/ui` pickers: Checkbox, Select, LinkPicker

**Files:**
- Modify: `packages/ui/src/tokens/tokens.json`: add `scrim` to both `light` and `dark`.
- Create: `packages/ui/src/components/FieldMessage.tsx` and `packages/ui/src/components/PickerSheet.tsx`. Both are internal and not exported.
- Create: `packages/ui/src/components/Checkbox.tsx`, `Select.tsx`, `LinkPicker.tsx`.
- Modify: `packages/ui/src/index.ts`, `apps/app/app/(dev)/ui-gallery.tsx`.
- Test: `packages/ui/src/components/__tests__/pickers.test.tsx`.

**Interfaces:**
- Consumes: `Text`, `Heading`, `Button`, `Input`, `ListItem`, `Spinner`, `cn` from earlier tasks.
- Produces (exported from `@jci/ui`):

```ts
interface CheckboxProps { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; hint?: string; error?: string; testID?: string }
interface SelectOption { value: string; label: string }
interface SelectProps { label: string; value: string | null; options: readonly SelectOption[]; onChange: (value: string | null) => void;
  placeholder?: string; allowClear?: boolean; disabled?: boolean; hint?: string; error?: string; testID?: string }
interface LinkOption { value: string; label: string; description?: string }
interface LinkPickerProps { label: string; value: string | null; options: readonly LinkOption[]; onChange: (value: string | null) => void;
  loading?: boolean; unavailable?: string; allowClear?: boolean; disabled?: boolean; hint?: string; error?: string; testID?: string }
```

Accessibility:
- `Select` and `LinkPicker` triggers are buttons whose accessible name is the field label; the current choice is exposed through `accessibilityValue`.
- The choice list opens in a modal `PickerSheet`. Pressing an option chooses it and closes the sheet; Cancel or a tap outside closes it without a change.
- `LinkPicker` filters its options with a search box, matching label, value and description case-insensitively.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/components/__tests__/pickers.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Checkbox } from '../Checkbox';
import { LinkPicker } from '../LinkPicker';
import { Select } from '../Select';

const LEVELS = [
  { value: 'area', label: 'Area' },
  { value: 'local', label: 'Local' },
];
const ORGS = [
  { value: 'jci-kl', label: 'JCI Kuala Lumpur' },
  { value: 'jci-pj', label: 'JCI Petaling Jaya', description: 'Selangor' },
];

describe('Checkbox', () => {
  it('toggles and reports its state', async () => {
    const onChange = jest.fn();
    await render(<Checkbox label="Includes child organisations" checked={false} onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Includes child organisations' });
    expect(box.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does nothing when disabled', async () => {
    const onChange = jest.fn();
    await render(<Checkbox label="Active" checked onChange={onChange} disabled error="Not allowed" />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Active' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Not allowed')).toBeTruthy();
  });
});

describe('Select', () => {
  it('opens its options and reports the choice', async () => {
    const onChange = jest.fn();
    await render(<Select label="Level" value={null} options={LEVELS} onChange={onChange} testID="level" />);
    const trigger = screen.getByRole('button', { name: 'Level' });
    expect(trigger.props.accessibilityValue).toEqual({ text: 'Choose…' });
    await fireEvent.press(trigger);
    await fireEvent.press(screen.getByRole('button', { name: 'Local' }));
    expect(onChange).toHaveBeenCalledWith('local');
    expect(screen.queryByRole('button', { name: 'Area' })).toBeNull();
  });

  it('shows the current label and offers None when clearable', async () => {
    const onChange = jest.fn();
    await render(<Select label="Level" value="area" options={LEVELS} onChange={onChange} allowClear />);
    expect(screen.getByRole('button', { name: 'Level' }).props.accessibilityValue).toEqual({ text: 'Area' });
    await fireEvent.press(screen.getByRole('button', { name: 'Level' }));
    await fireEvent.press(screen.getByRole('button', { name: 'None' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('closes on Cancel without a change, and stays shut when disabled', async () => {
    const onChange = jest.fn();
    await render(<Select label="Level" value={null} options={LEVELS} onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Level' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Area' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    await render(<Select label="Kind" value={null} options={LEVELS} onChange={onChange} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Kind' }));
    expect(screen.queryByRole('button', { name: 'Area' })).toBeNull();
  });
});

describe('LinkPicker', () => {
  it('searches the options and reports the chosen id', async () => {
    const onChange = jest.fn();
    await render(<LinkPicker label="Organisation" value="jci-kl" options={ORGS} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Organisation' }).props.accessibilityValue).toEqual({ text: 'JCI Kuala Lumpur' });
    await fireEvent.press(screen.getByRole('button', { name: 'Organisation' }));
    await fireEvent.changeText(screen.getByLabelText('Search'), 'selangor');
    expect(screen.queryByRole('button', { name: 'JCI Kuala Lumpur, jci-kl' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'JCI Petaling Jaya, Selangor' }));
    expect(onChange).toHaveBeenCalledWith('jci-pj');
  });

  it('shows the raw id when the value is not among the options', async () => {
    await render(<LinkPicker label="Organisation" value="jci-far" options={ORGS} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Organisation' }).props.accessibilityValue).toEqual({ text: 'jci-far' });
  });

  it('shows loading, unavailable and empty states', async () => {
    await render(<LinkPicker label="Org" value={null} options={[]} onChange={() => {}} loading />);
    await fireEvent.press(screen.getByRole('button', { name: 'Org' }));
    expect(screen.getByRole('progressbar')).toBeTruthy();

    await render(<LinkPicker label="Org" value={null} options={[]} onChange={() => {}} unavailable="You can't list these here." />);
    await fireEvent.press(screen.getByRole('button', { name: 'Org' }));
    expect(screen.getByText("You can't list these here.")).toBeTruthy();

    await render(<LinkPicker label="Org" value={null} options={ORGS} onChange={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Org' }));
    await fireEvent.changeText(screen.getByLabelText('Search'), 'zzz');
    expect(screen.getByText('No matches')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @jci/ui -- pickers`
Expected: FAIL with `Cannot find module '../Checkbox'`.

- [ ] **Step 3: Add the scrim token**

In `packages/ui/src/tokens/tokens.json`, add a `scrim` entry after `focus`:
- in `semantic.light`: `"scrim": "#121620"`
- in `semantic.dark`: `"scrim": "#000000"`

It is used only at 60 % opacity (`bg-scrim/60`), behind modal sheets.

Run: `npm test -w @jci/ui -- contrast`
Expected: PASS. Both themes define the same names.

- [ ] **Step 4: Write the shared pieces**

Create `packages/ui/src/components/FieldMessage.tsx`:

```tsx
import { Text } from '../primitives/Text';

/** The error (announced) or hint line shown under a form control. */
export function FieldMessage({ error, hint }: { error?: string; hint?: string }) {
  if (error) {
    return (
      <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
        {error}
      </Text>
    );
  }
  return hint ? (
    <Text variant="caption" tone="muted">
      {hint}
    </Text>
  ) : null;
}
```

Create `packages/ui/src/components/PickerSheet.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Heading } from '../primitives/Heading';
import { Button } from './Button';

export interface PickerSheetProps {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** A centred modal panel for choosing a value. Cancel or a tap outside closes it. */
export function PickerSheet({ title, visible, onClose, children }: PickerSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center bg-scrim/60 px-4 dark:bg-scrim-dark/60"
        accessibilityLabel="Close the list"
        onPress={onClose}
      >
        <View
          className="max-h-[80%] w-full max-w-md gap-2 rounded-xl border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
          onStartShouldSetResponder={() => true}
        >
          <Heading level={3}>{title}</Heading>
          {children}
          <Button label="Cancel" variant="ghost" onPress={onClose} />
        </View>
      </Pressable>
    </Modal>
  );
}
```

The backdrop `Pressable` has no `accessibilityRole`, so screen readers only offer the explicit Cancel button. The panel's `onStartShouldSetResponder` stops taps inside it from reaching the backdrop.

- [ ] **Step 5: Write the components**

Create `packages/ui/src/components/Checkbox.tsx`:

```tsx
import { Pressable, Text as RNText, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { FieldMessage } from './FieldMessage';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
  error?: string;
  testID?: string;
}

const FOCUS = 'web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-focus dark:web:focus-visible:ring-focus-dark';
const BOX_ON = 'border-primary bg-primary dark:border-primary-dark dark:bg-primary-dark';
const BOX_OFF = 'border-border bg-surface dark:border-border-dark dark:bg-surface-dark';

export function Checkbox({ label, checked, onChange, disabled = false, hint, error, testID }: CheckboxProps) {
  return (
    <View className="gap-1">
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={() => onChange(!checked)}
        className={cn('min-h-11 flex-row items-center gap-3 rounded-lg active:opacity-80', FOCUS, disabled && 'opacity-50')}
      >
        <View className={cn('h-6 w-6 items-center justify-center rounded border-2', checked ? BOX_ON : BOX_OFF)}>
          {checked ? <RNText className="text-sm font-bold text-on-primary dark:text-on-primary-dark">✓</RNText> : null}
        </View>
        <Text>{label}</Text>
      </Pressable>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}
```

Create `packages/ui/src/components/Select.tsx`:

```tsx
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { FieldMessage } from './FieldMessage';
import { ListItem } from './ListItem';
import { PickerSheet } from './PickerSheet';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  value: string | null;
  options: readonly SelectOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Offer a "None" choice that clears the value. */
  allowClear?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
  testID?: string;
}

export const TRIGGER =
  'min-h-11 flex-row items-center rounded-lg border bg-surface px-3 dark:bg-surface-dark web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-focus dark:web:focus-visible:ring-focus-dark';
export const TRIGGER_BORDER = 'border-border dark:border-border-dark';
export const TRIGGER_ERROR = 'border-danger dark:border-danger-dark';

export function Select({ label, value, options, onChange, placeholder = 'Choose…', allowClear = false, disabled = false, hint, error, testID }: SelectProps) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? value;
  const choose = (next: string | null) => {
    setOpen(false);
    onChange(next);
  };
  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: current ?? placeholder }}
        accessibilityHint="Opens the list of choices"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(TRIGGER, error ? TRIGGER_ERROR : TRIGGER_BORDER, disabled && 'opacity-50')}
      >
        <Text tone={current ? 'default' : 'muted'} numberOfLines={1}>
          {current ?? placeholder}
        </Text>
      </Pressable>
      <FieldMessage error={error} hint={hint} />
      <PickerSheet title={label} visible={open} onClose={() => setOpen(false)}>
        <ScrollView>
          {allowClear ? <ListItem title="None" selected={value === null} onPress={() => choose(null)} /> : null}
          {options.map((o) => (
            <ListItem
              key={o.value}
              testID={testID ? `${testID}-${o.value}` : undefined}
              title={o.label}
              selected={o.value === value}
              onPress={() => choose(o.value)}
            />
          ))}
        </ScrollView>
      </PickerSheet>
    </View>
  );
}
```

Create `packages/ui/src/components/LinkPicker.tsx`:

```tsx
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { FieldMessage } from './FieldMessage';
import { Input } from './Input';
import { ListItem } from './ListItem';
import { PickerSheet } from './PickerSheet';
import { TRIGGER, TRIGGER_BORDER, TRIGGER_ERROR } from './Select';
import { Spinner } from './Spinner';

export interface LinkOption {
  value: string;
  label: string;
  description?: string;
}

export interface LinkPickerProps {
  label: string;
  /** The linked document's id. */
  value: string | null;
  options: readonly LinkOption[];
  onChange: (value: string | null) => void;
  loading?: boolean;
  /** Shown instead of the list when the caller cannot list the target here. */
  unavailable?: string;
  allowClear?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
  testID?: string;
}

export function LinkPicker({
  label,
  value,
  options,
  onChange,
  loading = false,
  unavailable,
  allowClear = false,
  disabled = false,
  hint,
  error,
  testID,
}: LinkPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const current = options.find((o) => o.value === value)?.label ?? value;
  const needle = search.trim().toLowerCase();
  const shown =
    needle === '' ? options : options.filter((o) => [o.label, o.value, o.description ?? ''].some((s) => s.toLowerCase().includes(needle)));
  const close = () => {
    setOpen(false);
    setSearch('');
  };
  const choose = (next: string | null) => {
    close();
    onChange(next);
  };

  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: current ?? 'Choose…' }}
        accessibilityHint="Opens a searchable list"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(TRIGGER, error ? TRIGGER_ERROR : TRIGGER_BORDER, disabled && 'opacity-50')}
      >
        <Text tone={current ? 'default' : 'muted'} numberOfLines={1}>
          {current ?? 'Choose…'}
        </Text>
      </Pressable>
      <FieldMessage error={error} hint={hint} />
      <PickerSheet title={label} visible={open} onClose={close}>
        <Input label="Search" value={search} onChangeText={setSearch} autoCapitalize="none" />
        {loading ? (
          <Spinner />
        ) : unavailable ? (
          <Text tone="muted">{unavailable}</Text>
        ) : (
          <ScrollView>
            {allowClear ? <ListItem title="None" selected={value === null} onPress={() => choose(null)} /> : null}
            {shown.length === 0 ? <Text tone="muted">No matches</Text> : null}
            {shown.map((o) => (
              <ListItem
                key={o.value}
                title={o.label}
                subtitle={o.description ?? (o.label === o.value ? undefined : o.value)}
                selected={o.value === value}
                onPress={() => choose(o.value)}
              />
            ))}
          </ScrollView>
        )}
      </PickerSheet>
    </View>
  );
}
```

In `packages/ui/src/index.ts`, add after the `ListItem` export:

```ts
export { Checkbox, type CheckboxProps } from './components/Checkbox';
export { Select, type SelectProps, type SelectOption } from './components/Select';
export { LinkPicker, type LinkPickerProps, type LinkOption } from './components/LinkPicker';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -w @jci/ui`
Expected: PASS, including all earlier suites.

- [ ] **Step 7: Add the gallery entries**

In `apps/app/app/(dev)/ui-gallery.tsx`:
- Add `Checkbox`, `LinkPicker` and `Select` to the `@jci/ui` import.
- Add this state below the existing `useState` lines:

```tsx
  const [checked, setChecked] = useState(false);
  const [level, setLevel] = useState<string | null>(null);
  const [org, setOrg] = useState<string | null>('jci-kl');
```

- Insert this card directly before `<Card title="Empty state">`:

```tsx
      <Card title="Pickers">
        <Checkbox label="Includes child organisations" checked={checked} onChange={setChecked} hint="Grants the role below this org too" />
        <Select
          label="Level"
          value={level}
          onChange={setLevel}
          allowClear
          options={[
            { value: 'national', label: 'National' },
            { value: 'local', label: 'Local' },
          ]}
        />
        <LinkPicker
          label="Organisation"
          value={org}
          onChange={setOrg}
          options={[
            { value: 'jci-kl', label: 'JCI Kuala Lumpur' },
            { value: 'jci-pj', label: 'JCI Petaling Jaya', description: 'Selangor' },
          ]}
        />
      </Card>
```

- [ ] **Step 8: Run the checks and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add packages/ui apps/app/app/\(dev\)/ui-gallery.tsx
git commit -m "feat(ui): Checkbox, Select and searchable LinkPicker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `@jci/ui` `fields/`: one FieldControl per field type, including child tables

**Files:**
- Modify: `packages/ui/package.json`. Add `"@jci/core": "*"` to `dependencies`; it is used for type imports only.
- Modify: `packages/ui/src/components/Input.tsx`. Add a `multiline` prop.
- Create: `packages/ui/src/fields/types.ts`, `hints.ts`, `TextField.tsx`, `NumberField.tsx`, `JsonField.tsx`, `CheckField.tsx`, `SelectField.tsx`, `ChildTable.tsx`, `FieldControl.tsx`
- Create: `apps/app/app/(dev)/gallery-fields.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/app/app/(dev)/ui-gallery.tsx` (Layouts card)
- Test: `packages/ui/src/fields/__tests__/fields.test.tsx`

**Interfaces:**
- Consumes:
  - `FormField` and `FieldDef` from `@jci/core` (**type-only**)
  - `Input`, `Checkbox`, `Select`, `Button`, `Box`, `Stack`, `Text` (earlier tasks)
- Produces (exported from `@jci/ui`):

```ts
interface FieldControlProps { field: FormField; value: unknown; onChange: (value: unknown) => void; error?: string; renderField?: RenderField; testID?: string }
type RenderField = (props: FieldControlProps) => ReactNode | undefined   // return undefined to use the default control
function FieldControl(props: FieldControlProps): JSX.Element
function fieldHint(def: FieldDef): string | undefined
```

What each field type renders and emits:

| Field type | Control | Emits |
| --- | --- | --- |
| `Data`, `Text` (multiline), `Date`, `Datetime`, `AttachImage` | text `Input` | the text |
| `Link` (default) | text `Input` holding the id | the text |
| `Int`, `Float`, `Currency` | numeric `Input` | a number; `null` when empty; the raw text when it is not a number, so validation reports it |
| `JSON` | multiline `Input` | a parsed object; `null` when empty; the raw text when it is not a JSON object |
| `Check` | `Checkbox` | a boolean |
| `Select` | `Select` | a string or `null` |
| `Table` | `ChildTable` | a new array of row objects: one card per row with a control per column, plus "Add row" and "Remove row N" when the table is editable |

Every control is disabled when `field.editable` is false. It shows `error` when given, and otherwise the `fieldHint`.

- [ ] **Step 1: Add the dependency and the multiline input**

In `packages/ui/package.json`, add `"@jci/core": "*"` to `dependencies`, then run `npm install`.

In `packages/ui/src/components/Input.tsx`:
- Add `multiline?: boolean;` to `InputProps`, after `editable`.
- Destructure it as `multiline = false` in the component signature.
- Pass `multiline={multiline}` and `textAlignVertical={multiline ? 'top' : 'center'}` to the `TextInput`.
- Add `multiline && 'min-h-24 py-2'` as the last argument of the `className` `cn(...)`.

- [ ] **Step 2: Write the failing tests**

Create `packages/ui/src/fields/__tests__/fields.test.tsx`:

```tsx
import type { FieldDef, FormField } from '@jci/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from '../../primitives/Text';
import { FieldControl } from '../FieldControl';
import type { RenderField } from '../types';

function field(def: Partial<FieldDef> & Pick<FieldDef, 'fieldname' | 'fieldtype'>, extra: Partial<FormField> = {}): FormField {
  return { def: { label: def.fieldname, ...def }, key: def.fieldname, editable: true, children: null, ...extra };
}

/** Holds the value like a form would, and records every change. */
function Harness({ f, initial = null, spy, renderField }: { f: FormField; initial?: unknown; spy: jest.Mock; renderField?: RenderField }) {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <FieldControl
      field={f}
      value={value}
      renderField={renderField}
      onChange={(v) => {
        spy(v);
        setValue(v);
      }}
    />
  );
}

describe('text-like fields', () => {
  it('edits Data and shows the required hint', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'title', label: 'Name', fieldtype: 'Data', reqd: true })} spy={spy} />);
    expect(screen.getByText('Required')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'JCI KL');
    expect(spy).toHaveBeenLastCalledWith('JCI KL');
  });

  it('uses a multiline input for Text and a format hint for Date', async () => {
    await render(<Harness f={field({ fieldname: 'notes', label: 'Notes', fieldtype: 'Text' })} spy={jest.fn()} />);
    expect(screen.getByLabelText('Notes').props.multiline).toBe(true);
    await render(<Harness f={field({ fieldname: 'joinDate', label: 'Join date', fieldtype: 'Date' })} spy={jest.fn()} />);
    expect(screen.getByText('YYYY-MM-DD')).toBeTruthy();
  });

  it('disables controls that are not editable', async () => {
    await render(<Harness f={field({ fieldname: 'authUid', label: 'Auth UID', fieldtype: 'Data' }, { editable: false })} initial="abc" spy={jest.fn()} />);
    expect(screen.getByLabelText('Auth UID').props.editable).toBe(false);
    expect(screen.getByLabelText('Auth UID').props.value).toBe('abc');
  });

  it('falls back to an id input for Link fields', async () => {
    await render(<Harness f={field({ fieldname: 'parent', label: 'Parent', fieldtype: 'Link', link: 'Organization' })} spy={jest.fn()} />);
    expect(screen.getByText('Organization id')).toBeTruthy();
  });
});

describe('number and JSON fields', () => {
  it('emits numbers, null when empty and the raw text when invalid', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'year', label: 'Year', fieldtype: 'Int' })} spy={spy} />);
    const input = screen.getByLabelText('Year');
    await fireEvent.changeText(input, '42');
    expect(spy).toHaveBeenLastCalledWith(42);
    await fireEvent.changeText(input, 'abc');
    expect(spy).toHaveBeenLastCalledWith('abc');
    await fireEvent.changeText(input, '');
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it('keeps in-progress text such as "1." while emitting the number', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'amount', label: 'Amount', fieldtype: 'Currency' })} spy={spy} />);
    await fireEvent.changeText(screen.getByLabelText('Amount'), '1.');
    expect(spy).toHaveBeenLastCalledWith(1);
    expect(screen.getByLabelText('Amount').props.value).toBe('1.');
  });

  it('parses JSON objects and passes other text through', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'extra', label: 'Extra', fieldtype: 'JSON' })} spy={spy} />);
    await fireEvent.changeText(screen.getByLabelText('Extra'), '{"a": 1}');
    expect(spy).toHaveBeenLastCalledWith({ a: 1 });
    await fireEvent.changeText(screen.getByLabelText('Extra'), '[1]');
    expect(spy).toHaveBeenLastCalledWith('[1]');
  });
});

describe('check and select fields', () => {
  it('toggles a Check field', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'withDescendants', label: 'Includes child organisations', fieldtype: 'Check' })} spy={spy} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Includes child organisations' }));
    expect(spy).toHaveBeenLastCalledWith(true);
  });

  it('chooses a Select option, with None for optional fields', async () => {
    const spy = jest.fn();
    await render(<Harness f={field({ fieldname: 'role', label: 'Role', fieldtype: 'Select', options: ['Member', 'OrgAdmin'] })} spy={spy} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Role' }));
    expect(screen.getByRole('button', { name: 'None' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'OrgAdmin' }));
    expect(spy).toHaveBeenLastCalledWith('OrgAdmin');
  });
});

describe('ChildTable', () => {
  const dues = (editable = true) =>
    field(
      { fieldname: 'dues', label: 'Dues', fieldtype: 'Table', childDocType: 'DuesRow' },
      {
        editable,
        children: [
          field({ fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true }, { editable }),
          field({ fieldname: 'amount', label: 'Amount', fieldtype: 'Currency' }, { editable: false }),
        ],
      },
    );

  it('edits, adds and removes rows as whole arrays', async () => {
    const spy = jest.fn();
    await render(<Harness f={dues()} initial={[{ year: 2025, amount: 350 }]} spy={spy} />);
    expect(screen.getByText('Row 1')).toBeTruthy();
    expect(screen.getByTestId('field-dues-0-amount').props.editable).toBe(false);
    await fireEvent.changeText(screen.getByTestId('field-dues-0-year'), '2026');
    expect(spy).toHaveBeenLastCalledWith([{ year: 2026, amount: 350 }]);
    await fireEvent.press(screen.getByRole('button', { name: 'Add row' }));
    expect(spy).toHaveBeenLastCalledWith([{ year: 2026, amount: 350 }, {}]);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(spy).toHaveBeenLastCalledWith([{}]);
  });

  it('offers no add or remove when the table is locked', async () => {
    await render(<Harness f={dues(false)} initial={[{ year: 2025 }]} spy={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Add row' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove row 1' })).toBeNull();
  });
});

describe('renderField', () => {
  it('lets the app replace a control, and falls back when it returns undefined', async () => {
    const renderField: RenderField = ({ field: f }) => (f.def.fieldtype === 'Link' ? <Text>Custom picker</Text> : undefined);
    await render(<Harness f={field({ fieldname: 'org', label: 'Org', fieldtype: 'Link', link: 'Organization' })} spy={jest.fn()} renderField={renderField} />);
    expect(screen.getByText('Custom picker')).toBeTruthy();
    await render(<Harness f={field({ fieldname: 'title', label: 'Name', fieldtype: 'Data' })} spy={jest.fn()} renderField={renderField} />);
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -w @jci/ui -- fields`
Expected: FAIL with `Cannot find module '../FieldControl'`.

- [ ] **Step 4: Implement the field controls**

Create `packages/ui/src/fields/types.ts`:

```ts
import type { FormField } from '@jci/core';
import type { ReactNode } from 'react';

export interface FieldControlProps {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  /** Lets the app replace a control, e.g. with a data-backed Link picker. Return undefined to use the default. */
  renderField?: RenderField;
  testID?: string;
}

export type RenderField = (props: FieldControlProps) => ReactNode | undefined;
```

Create `packages/ui/src/fields/hints.ts`:

```ts
import type { FieldDef } from '@jci/core';

/** The helper line shown under a field when it has no error. */
export function fieldHint(def: FieldDef): string | undefined {
  const parts: string[] = [];
  if (def.reqd) parts.push('Required');
  switch (def.fieldtype) {
    case 'Date':
      parts.push('YYYY-MM-DD');
      break;
    case 'Datetime':
      parts.push('e.g. 2026-09-29T10:00:00+08:00');
      break;
    case 'AttachImage':
      parts.push('Image URL');
      break;
    case 'JSON':
      parts.push('A JSON object');
      break;
    case 'Currency':
      parts.push('Up to 2 decimal places');
      break;
    case 'Link':
      parts.push(`${def.link} id`);
      break;
    default:
      break;
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
```

Create `packages/ui/src/fields/TextField.tsx`:

```tsx
import { Input } from '../components/Input';
import { fieldHint } from './hints';
import type { FieldControlProps } from './types';

export function TextField({ field, value, onChange, error, testID }: FieldControlProps) {
  const type = field.def.fieldtype;
  const text = typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  return (
    <Input
      testID={testID}
      label={field.def.label}
      value={text}
      onChangeText={onChange}
      editable={field.editable}
      error={error}
      hint={fieldHint(field.def)}
      multiline={type === 'Text'}
      autoCapitalize={type === 'Data' || type === 'Text' ? 'sentences' : 'none'}
    />
  );
}
```

Create `packages/ui/src/fields/NumberField.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Input } from '../components/Input';
import { fieldHint } from './hints';
import type { FieldControlProps } from './types';

/** A number, null when blank, or the raw text so validation can report it. */
function toNumber(text: string): number | string | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : text;
}

const show = (value: unknown) => (value === null || value === undefined ? '' : String(value));

export function NumberField({ field, value, onChange, error, testID }: FieldControlProps) {
  const [text, setText] = useState(show(value));
  // Follow outside changes (e.g. a reset) without overwriting in-progress text such as "1.".
  useEffect(() => {
    setText((current) => (toNumber(current) === (value ?? null) ? current : show(value)));
  }, [value]);
  return (
    <Input
      testID={testID}
      label={field.def.label}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(toNumber(next));
      }}
      keyboardType="numeric"
      editable={field.editable}
      error={error}
      hint={fieldHint(field.def)}
    />
  );
}
```

Create `packages/ui/src/fields/JsonField.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Input } from '../components/Input';
import { fieldHint } from './hints';
import type { FieldControlProps } from './types';

/** A parsed JSON object, null when blank, or the raw text so validation can report it. */
function toJson(text: string): unknown {
  const t = text.trim();
  if (t === '') return null;
  try {
    const v: unknown = JSON.parse(t);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : text;
  } catch {
    return text;
  }
}

const show = (value: unknown) =>
  value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);

export function JsonField({ field, value, onChange, error, testID }: FieldControlProps) {
  const [text, setText] = useState(show(value));
  useEffect(() => {
    setText((current) => (JSON.stringify(toJson(current)) === JSON.stringify(value ?? null) ? current : show(value)));
  }, [value]);
  return (
    <Input
      testID={testID}
      label={field.def.label}
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(toJson(next));
      }}
      multiline
      autoCapitalize="none"
      editable={field.editable}
      error={error}
      hint={fieldHint(field.def)}
    />
  );
}
```

Create `packages/ui/src/fields/CheckField.tsx`:

```tsx
import { Checkbox } from '../components/Checkbox';
import { fieldHint } from './hints';
import type { FieldControlProps } from './types';

export function CheckField({ field, value, onChange, error, testID }: FieldControlProps) {
  return (
    <Checkbox
      testID={testID}
      label={field.def.label}
      checked={value === true}
      onChange={onChange}
      disabled={!field.editable}
      error={error}
      hint={fieldHint(field.def)}
    />
  );
}
```

Create `packages/ui/src/fields/SelectField.tsx`:

```tsx
import { Select } from '../components/Select';
import { fieldHint } from './hints';
import type { FieldControlProps } from './types';

export function SelectField({ field, value, onChange, error, testID }: FieldControlProps) {
  return (
    <Select
      testID={testID}
      label={field.def.label}
      value={typeof value === 'string' ? value : null}
      options={(field.def.options ?? []).map((o) => ({ value: o, label: o }))}
      onChange={onChange}
      allowClear={field.def.reqd !== true}
      disabled={!field.editable}
      error={error}
      hint={fieldHint(field.def)}
    />
  );
}
```

Create `packages/ui/src/fields/ChildTable.tsx`:

```tsx
import { View } from 'react-native';
import { Button } from '../components/Button';
import { FieldMessage } from '../components/FieldMessage';
import { Box } from '../primitives/Box';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';
import { FieldControl } from './FieldControl';
import type { FieldControlProps } from './types';

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Edits a Table field. Every change emits the whole array, in order (the API compares rows by position). */
export function ChildTable({ field, value, onChange, error, renderField, testID }: FieldControlProps) {
  const rows = Array.isArray(value) ? value.map((r) => (isRecord(r) ? r : {})) : [];
  const columns = field.children ?? [];
  const setCell = (index: number, key: string, cell: unknown) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: cell } : row)));

  return (
    <View testID={testID ?? `field-${field.key}`} className="gap-2">
      <Text variant="label">{field.def.label}</Text>
      {rows.length === 0 ? (
        <Text variant="caption" tone="muted">
          No rows
        </Text>
      ) : null}
      {rows.map((row, index) => (
        <Box key={index} padding="md" rounded bordered>
          <Stack gap="sm">
            <Stack direction="row" justify="between" align="center">
              <Text variant="label">{`Row ${index + 1}`}</Text>
              {field.editable ? (
                <Button label={`Remove row ${index + 1}`} variant="ghost" size="sm" onPress={() => onChange(rows.filter((_, i) => i !== index))} />
              ) : null}
            </Stack>
            {columns.map((col) => (
              <FieldControl
                key={col.key}
                testID={`field-${field.key}-${index}-${col.key}`}
                field={col}
                value={row[col.key] ?? null}
                onChange={(cell) => setCell(index, col.key, cell)}
                renderField={renderField}
              />
            ))}
          </Stack>
        </Box>
      ))}
      {field.editable ? <Button label="Add row" variant="secondary" size="sm" onPress={() => onChange([...rows, {}])} /> : null}
      <FieldMessage error={error} />
    </View>
  );
}
```

Create `packages/ui/src/fields/FieldControl.tsx`:

```tsx
import { CheckField } from './CheckField';
import { ChildTable } from './ChildTable';
import { JsonField } from './JsonField';
import { NumberField } from './NumberField';
import { SelectField } from './SelectField';
import { TextField } from './TextField';
import type { FieldControlProps } from './types';

/** The control for one form field, chosen by field type. `renderField` may replace it. */
export function FieldControl(props: FieldControlProps) {
  const replaced = props.renderField?.(props);
  if (replaced !== undefined) return <>{replaced}</>;
  const withId = { ...props, testID: props.testID ?? `field-${props.field.key}` };
  switch (props.field.def.fieldtype) {
    case 'Check':
      return <CheckField {...withId} />;
    case 'Select':
      return <SelectField {...withId} />;
    case 'Table':
      return <ChildTable {...withId} />;
    case 'Int':
    case 'Float':
    case 'Currency':
      return <NumberField {...withId} />;
    case 'JSON':
      return <JsonField {...withId} />;
    default:
      // Data, Text, Date, Datetime, AttachImage, and Link when the app supplies no picker.
      return <TextField {...withId} />;
  }
}
```

In `packages/ui/src/index.ts`, append:

```ts
export { FieldControl } from './fields/FieldControl';
export { fieldHint } from './fields/hints';
export type { FieldControlProps, RenderField } from './fields/types';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w @jci/ui`
Expected: PASS.

- [ ] **Step 6: Add the fields gallery route**

Create `apps/app/app/(dev)/gallery-fields.tsx`:

```tsx
import type { FieldDef, FormField } from '@jci/core';
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Card, FieldControl, Heading, Screen } from '@jci/ui';

const f = (def: Partial<FieldDef> & Pick<FieldDef, 'fieldname' | 'fieldtype'>, extra: Partial<FormField> = {}): FormField => ({
  def: { label: def.fieldname, ...def },
  key: def.fieldname,
  editable: true,
  children: null,
  ...extra,
});

const FIELDS: FormField[] = [
  f({ fieldname: 'title', label: 'Name (Data, required)', fieldtype: 'Data', reqd: true }),
  f({ fieldname: 'notes', label: 'Notes (Text)', fieldtype: 'Text' }),
  f({ fieldname: 'members', label: 'Members (Int)', fieldtype: 'Int' }),
  f({ fieldname: 'dues', label: 'Dues (Currency)', fieldtype: 'Currency' }),
  f({ fieldname: 'founded', label: 'Founded (Date)', fieldtype: 'Date' }),
  f({ fieldname: 'active', label: 'Active (Check)', fieldtype: 'Check' }),
  f({ fieldname: 'level', label: 'Level (Select)', fieldtype: 'Select', options: ['national', 'local'] }),
  f({ fieldname: 'parent', label: 'Parent (Link, no picker)', fieldtype: 'Link', link: 'Organization' }),
  f({ fieldname: 'extra', label: 'Extra (JSON)', fieldtype: 'JSON' }),
  f({ fieldname: 'code', label: 'Code (locked)', fieldtype: 'Data' }, { editable: false }),
  f(
    { fieldname: 'history', label: 'History (Table)', fieldtype: 'Table', childDocType: 'Row' },
    {
      children: [
        f({ fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true }),
        f({ fieldname: 'note', label: 'Note', fieldtype: 'Data' }),
      ],
    },
  ),
];

export default function GalleryFields() {
  const [values, setValues] = useState<Record<string, unknown>>({ code: 'jci-kl', history: [{ year: 2025, note: 'Joined' }] });
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen>
      <Heading level={1}>Field controls</Heading>
      <Card title="One control per field type">
        {FIELDS.map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            value={values[field.key] ?? null}
            onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
            error={field.key === 'members' && typeof values.members === 'string' ? 'Enter a whole number' : undefined}
          />
        ))}
      </Card>
    </Screen>
  );
}
```

In `apps/app/app/(dev)/ui-gallery.tsx`, add this button to the `Layouts` card's `Stack`:

```tsx
          <Button label="Field controls" variant="secondary" onPress={() => router.push('/gallery-fields')} />
```

- [ ] **Step 7: Run the checks and commit**

Run: `npm run check`
Expected: PASS. Lint accepts `import type` from `@jci/core` in `packages/ui`.

```bash
git add packages/ui package-lock.json apps/app/app/\(dev\)
git commit -m "feat(ui): field controls for every field type, with a child-table editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `@jci/ui` `desk/`: DocForm and Timeline

**Files:**
- Create: `packages/ui/src/desk/DocForm.tsx`, `packages/ui/src/desk/Timeline.tsx`
- Create: `apps/app/app/(dev)/gallery-doc-form.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/app/app/(dev)/ui-gallery.tsx`
- Test: `packages/ui/src/desk/__tests__/desk.test.tsx`

**Interfaces:**
- Consumes:
  - `FormSection`, `FormValues` from `@jci/core` (**type-only**)
  - `FieldControl`, `RenderField` (Task 4)
  - `Card`, `Button`, `Text`, `Stack` (earlier tasks)
- Produces (exported from `@jci/ui`):

```ts
interface DocFormProps {
  sections: readonly FormSection[];          // already filtered for visibility by the caller
  values: FormValues;
  errors?: Readonly<Record<string, string>>; // by field key
  formError?: string | null;
  onChange: (key: string, value: unknown) => void;
  /** Omit for a read-only form: no submit button. */
  onSubmit?: () => void;
  submitLabel?: string;                      // default 'Save'
  submitting?: boolean;
  renderField?: RenderField;
  testID?: string;
}
interface TimelineItem { id: string; title: string; when: string; changes: readonly { label: string; from: string; to: string }[] }
interface TimelineProps { items: readonly TimelineItem[]; emptyText?: string; testID?: string }
```

- `DocForm` renders one `Card` per section, titled when the section has a title, with a `FieldControl` per field.
- Below the cards it shows the form error, announced to screen readers, and then the submit button.
- `Timeline` renders a titled card with one entry per item, each listing its changes as `Label: from → to`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ui/src/desk/__tests__/desk.test.tsx`:

```tsx
import type { FieldDef, FormField, FormSection } from '@jci/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DocForm } from '../DocForm';
import { Timeline } from '../Timeline';

const f = (def: Partial<FieldDef> & Pick<FieldDef, 'fieldname' | 'fieldtype'>, editable = true): FormField => ({
  def: { label: def.fieldname, ...def },
  key: def.fieldname,
  editable,
  children: null,
});

const sections: FormSection[] = [
  { title: 'Basics', fields: [f({ fieldname: 'title', label: 'Name', fieldtype: 'Data', reqd: true })] },
  { title: null, fields: [f({ fieldname: 'code', label: 'Code', fieldtype: 'Data' }, false)] },
];

describe('DocForm', () => {
  it('renders sections, reports changes by key and submits', async () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    await render(<DocForm sections={sections} values={{ title: 'JCI KL', code: 'jci-kl' }} onChange={onChange} onSubmit={onSubmit} submitLabel="Save changes" />);
    expect(screen.getByRole('header', { name: 'Basics' })).toBeTruthy();
    expect(screen.getByLabelText('Code').props.editable).toBe(false);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'JCI Kuala Lumpur');
    expect(onChange).toHaveBeenCalledWith('title', 'JCI Kuala Lumpur');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows field and form errors', async () => {
    await render(
      <DocForm sections={sections} values={{}} errors={{ title: 'Required' }} formError="You cannot edit this Organization" onChange={() => {}} onSubmit={() => {}} />,
    );
    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.getByText('You cannot edit this Organization')).toBeTruthy();
  });

  it('has no submit button when read-only, and a busy one while submitting', async () => {
    await render(<DocForm sections={sections} values={{}} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await render(<DocForm sections={sections} values={{}} onChange={() => {}} onSubmit={() => {}} submitting />);
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toMatchObject({ busy: true });
  });
});

describe('Timeline', () => {
  it('lists entries with their changes', async () => {
    await render(
      <Timeline
        items={[{ id: 'v1', title: 'Updated by u-admin', when: '29/09/2026, 10:00', changes: [{ label: 'Name', from: 'JCI KL', to: 'JCI Kuala Lumpur' }] }]}
      />,
    );
    expect(screen.getByRole('header', { name: 'Timeline' })).toBeTruthy();
    expect(screen.getByText('Updated by u-admin')).toBeTruthy();
    expect(screen.getByText('Name: JCI KL → JCI Kuala Lumpur')).toBeTruthy();
  });

  it('says when nothing has been recorded', async () => {
    await render(<Timeline items={[]} />);
    expect(screen.getByText('No changes recorded yet.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @jci/ui -- desk`
Expected: FAIL with `Cannot find module '../DocForm'`.

- [ ] **Step 3: Implement the components**

Create `packages/ui/src/desk/DocForm.tsx`:

```tsx
import type { FormSection, FormValues } from '@jci/core';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FieldControl } from '../fields/FieldControl';
import type { RenderField } from '../fields/types';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';

export interface DocFormProps {
  /** Sections to show, already filtered for dependsOn visibility. */
  sections: readonly FormSection[];
  values: FormValues;
  errors?: Readonly<Record<string, string>>;
  formError?: string | null;
  onChange: (key: string, value: unknown) => void;
  /** Omit for a read-only form: no submit button. */
  onSubmit?: () => void;
  submitLabel?: string;
  submitting?: boolean;
  renderField?: RenderField;
  testID?: string;
}

/** A DocType form: one card per section, a control per field, then the form error and submit button. */
export function DocForm({
  sections,
  values,
  errors,
  formError,
  onChange,
  onSubmit,
  submitLabel = 'Save',
  submitting = false,
  renderField,
  testID,
}: DocFormProps) {
  return (
    <Stack gap="md" testID={testID}>
      {sections.map((section, index) => (
        <Card key={section.title ?? `section-${index}`} title={section.title ?? undefined}>
          {section.fields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={values[field.key] ?? null}
              onChange={(value) => onChange(field.key, value)}
              error={errors?.[field.key]}
              renderField={renderField}
            />
          ))}
        </Card>
      ))}
      {formError ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      ) : null}
      {onSubmit ? <Button label={submitLabel} onPress={onSubmit} loading={submitting} /> : null}
    </Stack>
  );
}
```

Create `packages/ui/src/desk/Timeline.tsx`:

```tsx
import { View } from 'react-native';
import { Card } from '../components/Card';
import { Text } from '../primitives/Text';

export interface TimelineItem {
  id: string;
  title: string;
  when: string;
  changes: readonly { label: string; from: string; to: string }[];
}

export interface TimelineProps {
  items: readonly TimelineItem[];
  emptyText?: string;
  testID?: string;
}

/** A document's change history, newest first. */
export function Timeline({ items, emptyText = 'No changes recorded yet.', testID }: TimelineProps) {
  return (
    <Card title="Timeline" testID={testID}>
      {items.length === 0 ? <Text tone="muted">{emptyText}</Text> : null}
      {items.map((item) => (
        <View key={item.id} className="gap-1 border-l-2 border-border pl-3 dark:border-border-dark">
          <Text variant="label">{item.title}</Text>
          {item.when ? (
            <Text variant="caption" tone="muted">
              {item.when}
            </Text>
          ) : null}
          {item.changes.map((c, i) => (
            <Text key={`${item.id}-${i}`} variant="caption">{`${c.label}: ${c.from} → ${c.to}`}</Text>
          ))}
        </View>
      ))}
    </Card>
  );
}
```

In `packages/ui/src/index.ts`, append:

```ts
export { DocForm, type DocFormProps } from './desk/DocForm';
export { Timeline, type TimelineProps, type TimelineItem } from './desk/Timeline';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @jci/ui`
Expected: PASS.

- [ ] **Step 5: Add the DocForm gallery route**

Create `apps/app/app/(dev)/gallery-doc-form.tsx`:

```tsx
import type { FieldDef, FormField, FormSection } from '@jci/core';
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { DocForm, Heading, Screen, Timeline } from '@jci/ui';

const f = (def: Partial<FieldDef> & Pick<FieldDef, 'fieldname' | 'fieldtype'>, editable = true): FormField => ({
  def: { label: def.fieldname, ...def },
  key: def.fieldname,
  editable,
  children: null,
});

const SECTIONS: FormSection[] = [
  {
    title: 'Organisation',
    fields: [
      f({ fieldname: 'code', label: 'Code', fieldtype: 'Data', reqd: true }, false),
      f({ fieldname: 'title', label: 'Name', fieldtype: 'Data', reqd: true }),
      f({ fieldname: 'level', label: 'Level', fieldtype: 'Select', options: ['national', 'local'], reqd: true }),
    ],
  },
  { title: null, fields: [f({ fieldname: 'currency', label: 'Currency', fieldtype: 'Data' })] },
];

export default function GalleryDocForm() {
  const [values, setValues] = useState<Record<string, unknown>>({ code: 'jci-kl', title: 'JCI Kuala Lumpur', level: 'local' });
  const [submitting, setSubmitting] = useState(false);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen>
      <Heading level={1}>DocForm</Heading>
      <DocForm
        sections={SECTIONS}
        values={values}
        errors={values.title === '' ? { title: 'Required' } : {}}
        onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        onSubmit={() => {
          setSubmitting(true);
          setTimeout(() => setSubmitting(false), 1000);
        }}
        submitting={submitting}
        submitLabel="Save changes"
      />
      <Timeline
        items={[
          { id: 'v2', title: 'Updated by admin@jci.test', when: '29 Sep 2026, 10:00', changes: [{ label: 'Name', from: 'JCI KL', to: 'JCI Kuala Lumpur' }] },
          { id: 'v1', title: 'Created by admin@jci.test', when: '1 Sep 2026, 09:00', changes: [{ label: 'Name', from: '—', to: 'JCI KL' }] },
        ]}
      />
    </Screen>
  );
}
```

In `apps/app/app/(dev)/ui-gallery.tsx`, add this button to the `Layouts` card's `Stack`:

```tsx
          <Button label="DocForm" variant="secondary" onPress={() => router.push('/gallery-doc-form')} />
```

- [ ] **Step 6: Run the checks and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add packages/ui apps/app/app/\(dev\)
git commit -m "feat(ui): DocForm and Timeline for the Desk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: The Desk form: create, edit and history screens

**Files:**
- Create: `apps/app/src/desk/docTypes.ts`, `useScopeOrgPath.ts`, `useDocForm.ts`, `LinkField.tsx`, `DocFormScreen.tsx`
- Create: `apps/app/app/(desk)/desk/[doctype]/new.tsx`, `apps/app/app/(desk)/desk/[doctype]/[id].tsx`
- Modify: `apps/app/app/(desk)/desk/[doctype]/index.tsx`. Rows now open the form, and a **New** button appears where the caller may create.

**Interfaces:**
- Consumes:
  - core: `formFields`, `visibleFormFields`, `sectionsOf`, `formValues`, `formPayload`, `resolveDocAccess`, `customFieldFromDoc`, `can`, `listFilters`, `filtersForDoc`, `docTypeLabel`, `CUSTOM_FIELD_DOCTYPE`, `ORGANIZATION_DOCTYPE`, and the types `DocAccess`, `DocTypeMeta`, `FormField`, `FormSection`, `FormValues`
  - `@jci/client`: `formErrorsFrom`, `formErrorsFromIssues`, `timelineEntries`, and the types `FormErrors`, `QueryDoc`
  - `@jci/client/react`: `useClient`, `useDocument`, `useDocs`, `useCustomFields`, `useVersions`
  - `@jci/ui`: `DocForm`, `Timeline`, `LinkPicker`, `Page`, `Heading`, `Text`, `Spinner`, `ErrorState`, `EmptyState`, `Button`, `ListItem`, `Stack`, and the types `FieldControlProps`, `RenderField`
  - `useDesk` (`apps/app/src/desk/DeskContext.tsx`)
- Produces:

```ts
function docTitle(meta: DocTypeMeta, doc: QueryDoc): string                 // titleField value or id
function deskDocType(name: unknown): DocTypeMeta | null                      // registered, non-child DocType or null
function useScopeOrgPath(): string[] | null | undefined                      // undefined while loading
type DocFormState =
  | { status: 'loading' }
  | { status: 'unavailable'; title: string; message: string }
  | { status: 'ready'; isNew: boolean; stored: QueryDoc | null; fields: FormField[]; sections: FormSection[]; values: FormValues;
      errors: FormErrors; submitting: boolean; setValue(key: string, value: unknown): void; submit: (() => void) | undefined }
function useDocForm(meta: DocTypeMeta, id: string | null): DocFormState
const renderDeskField: RenderField                                           // data-backed LinkPicker for Link fields
function DocFormScreen(props: { meta: DocTypeMeta; id: string | null }): JSX.Element
```

Routes:
- `/desk/[doctype]/new` opens the create form. After a successful create it replaces itself with `/desk/[doctype]/[id]`.
- `/desk/[doctype]/[id]` opens the edit form, with the Timeline below it.
- `submit` is `undefined` when the caller may not create or edit. The form is then shown read-only, with an explanation.

- [ ] **Step 1: Write the small helpers**

Create `apps/app/src/desk/docTypes.ts`:

```ts
import type { QueryDoc } from '@jci/client';
import type { DocTypeMeta } from '@jci/core';
import { registry } from '@jci/doctypes';

/** A document's display title: its titleField value, or its id. */
export function docTitle(meta: DocTypeMeta, doc: QueryDoc): string {
  const raw = meta.titleField ? doc.data[meta.titleField] : undefined;
  return typeof raw === 'string' && raw !== '' ? raw : doc.id;
}

/** The DocType a /desk route names, if it is a registered, non-child DocType. */
export function deskDocType(name: unknown): DocTypeMeta | null {
  return typeof name === 'string' && registry.has(name) && !registry.get(name).isChild ? registry.get(name) : null;
}
```

Create `apps/app/src/desk/useScopeOrgPath.ts`:

```ts
import { useDocument } from '@jci/client/react';
import { ORGANIZATION_DOCTYPE } from '@jci/core';
import { registry } from '@jci/doctypes';
import { useDesk } from './DeskContext';

const ORGANIZATIONS = registry.get(ORGANIZATION_DOCTYPE).collection;

/** The Desk scope org's orgPath: undefined while it loads, null when there is no scope or it cannot be read. */
export function useScopeOrgPath(): string[] | null | undefined {
  const { scope } = useDesk();
  const org = useDocument(scope ? ORGANIZATIONS : null, scope?.orgId ?? null);
  if (!scope) return null;
  if (org.status === 'loading') return undefined;
  const path = org.status === 'ready' ? org.doc?.data.orgPath : undefined;
  return Array.isArray(path) ? (path as string[]) : null;
}
```

- [ ] **Step 2: Write the form hook**

Create `apps/app/src/desk/useDocForm.ts`:

```ts
import { formErrorsFrom, formErrorsFromIssues, type FormErrors, type QueryDoc } from '@jci/client';
import { useClient, useCustomFields, useDocument } from '@jci/client/react';
import {
  CUSTOM_FIELD_DOCTYPE,
  customFieldFromDoc,
  docTypeLabel,
  formFields,
  formPayload,
  formValues,
  resolveDocAccess,
  sectionsOf,
  visibleFormFields,
  type DocAccess,
  type DocTypeMeta,
  type FormField,
  type FormSection,
  type FormValues,
} from '@jci/core';
import { registry } from '@jci/doctypes';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useDesk } from './DeskContext';
import { useScopeOrgPath } from './useScopeOrgPath';

const CUSTOM_FIELDS = registry.get(CUSTOM_FIELD_DOCTYPE).collection;
const resolveChild = (name: string) => registry.get(name);
const NO_ERRORS: FormErrors = { fields: {}, form: null };

export type DocFormState =
  | { status: 'loading' }
  | { status: 'unavailable'; title: string; message: string }
  | {
      status: 'ready';
      isNew: boolean;
      stored: QueryDoc | null;
      fields: FormField[];
      sections: FormSection[];
      values: FormValues;
      errors: FormErrors;
      submitting: boolean;
      setValue: (key: string, value: unknown) => void;
      submit: (() => void) | undefined;
    };

/** Loads a document (or starts a new one), works out what the caller may see and change, and saves it. */
export function useDocForm(meta: DocTypeMeta, id: string | null): DocFormState {
  const { api } = useClient();
  const { user, scope } = useDesk();
  const router = useRouter();
  const isNew = id === null;
  const label = docTypeLabel(meta);

  const doc = useDocument(isNew ? null : meta.collection, id);
  const scopePath = useScopeOrgPath();
  const customDefs = useCustomFields(CUSTOM_FIELDS, meta.name);
  const [values, setValues] = useState<FormValues | null>(null);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  const stored = doc.status === 'ready' ? doc.doc : null;
  // Where the document sits: the stored orgPath, or the scope org's for a new one. undefined = still loading.
  const orgPath: string[] | null | undefined = !meta.orgScoped
    ? null
    : isNew
      ? scopePath
      : stored
        ? Array.isArray(stored.data.orgPath)
          ? (stored.data.orgPath as string[])
          : []
        : undefined;

  const built = useMemo((): { access: DocAccess } | { error: string } | null => {
    if (orgPath === undefined || customDefs.status !== 'ready' || (!isNew && !stored)) return null;
    // Custom fields defined at an org on this document's path, like the server loads them.
    const customFields = customDefs.docs
      .map((d) => d.data)
      .filter((d) => orgPath === null || (typeof d.org === 'string' && orgPath.includes(d.org)))
      .map(customFieldFromDoc);
    const ownerPersonId = isNew ? user.personId : typeof stored?.data.ownerPersonId === 'string' ? stored.data.ownerPersonId : null;
    try {
      return { access: resolveDocAccess({ meta, customFields, user, doc: { orgPath, ownerPersonId }, resolveChild }) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [meta, user, orgPath, customDefs, stored, isNew]);

  const access = built && 'access' in built ? built.access : null;
  const fields = useMemo(() => (access ? formFields(access, resolveChild, isNew) : []), [access, isNew]);

  useEffect(() => {
    if (values === null && access) setValues(formValues(fields, stored?.data ?? null));
  }, [values, access, fields, stored]);

  if (doc.status === 'error') return { status: 'unavailable', title: `Can't open this ${label}`, message: doc.message };
  if (!isNew && doc.status === 'ready' && !stored) return { status: 'unavailable', title: 'Not found', message: `There is no ${label} "${id}".` };
  if (customDefs.status === 'error') return { status: 'unavailable', title: 'Could not load the form', message: customDefs.message };
  if (built && 'error' in built) return { status: 'unavailable', title: 'Could not load the form', message: built.error };
  if (!access || values === null) return { status: 'loading' };
  if (isNew && !access.canCreate) return { status: 'unavailable', title: 'Not allowed', message: `You can't create ${label} in this organisation.` };
  if (!isNew && !access.canRead) return { status: 'unavailable', title: 'Not allowed', message: `You can't see this ${label}.` };

  const current = values;
  async function save() {
    const patch = formPayload(fields, current, stored?.data ?? null);
    if (!isNew && Object.keys(patch).length === 0) {
      setErrors({ fields: {}, form: 'There are no changes to save.' });
      return;
    }
    // The same schema the server uses, so users see its messages before the round trip.
    const check = access!.schema(isNew ? 'create' : 'update').safeParse(patch);
    if (!check.success) {
      setErrors(formErrorsFromIssues(check.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }))));
      return;
    }
    setSubmitting(true);
    setErrors(NO_ERRORS);
    try {
      if (id === null) {
        const saved = await api.create(meta.name, { orgId: meta.orgScoped ? scope?.orgId : undefined, data: patch });
        router.replace({ pathname: '/desk/[doctype]/[id]', params: { doctype: meta.name, id: String(saved.id) } });
      } else {
        await api.update(meta.name, id, patch);
      }
    } catch (err) {
      setErrors(formErrorsFrom(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canSave = isNew ? access.canCreate : access.canWrite;
  return {
    status: 'ready',
    isNew,
    stored,
    fields,
    sections: sectionsOf(visibleFormFields(fields, current)),
    values: current,
    errors,
    submitting,
    setValue: (key, value) => {
      setValues((prev) => ({ ...(prev ?? {}), [key]: value }));
      setErrors((prev) => {
        if (!(key in prev.fields)) return prev;
        const { [key]: _cleared, ...rest } = prev.fields;
        return { ...prev, fields: rest };
      });
    },
    submit: canSave
      ? () => {
          void save();
        }
      : undefined,
  };
}
```

- [ ] **Step 3: Write the Link picker binding and the screen**

Create `apps/app/src/desk/LinkField.tsx`:

```tsx
import { useDocs } from '@jci/client/react';
import { docTypeLabel, listFilters } from '@jci/core';
import { registry } from '@jci/doctypes';
import { fieldHint, LinkPicker, type FieldControlProps, type RenderField } from '@jci/ui';
import { useDesk } from './DeskContext';
import { docTitle } from './docTypes';

/** A Link field backed by a live list of the target DocType in the current Desk scope. */
function LinkField({ field, value, onChange, error, testID }: FieldControlProps) {
  const { user, scope } = useDesk();
  const target = field.def.link && registry.has(field.def.link) ? registry.get(field.def.link) : null;
  const filters = target ? listFilters(target, user, scope) : null;
  const docs = useDocs(target?.collection ?? null, filters);
  const options = target && docs.status === 'ready' ? docs.docs.map((d) => ({ value: d.id, label: docTitle(target, d) })) : [];
  return (
    <LinkPicker
      testID={testID}
      label={field.def.label}
      value={typeof value === 'string' ? value : null}
      options={options}
      loading={docs.status === 'loading'}
      unavailable={target && !filters ? `You can't list ${docTypeLabel(target)} here. The saved value is kept.` : undefined}
      onChange={onChange}
      allowClear={field.def.reqd !== true}
      disabled={!field.editable}
      error={error ?? (docs.status === 'error' ? docs.message : undefined)}
      hint={fieldHint(field.def)}
    />
  );
}

export const renderDeskField: RenderField = (props) => (props.field.def.fieldtype === 'Link' ? <LinkField {...props} /> : undefined);
```

Create `apps/app/src/desk/DocFormScreen.tsx`:

```tsx
import { timelineEntries, type QueryDoc } from '@jci/client';
import { useVersions } from '@jci/client/react';
import { docTypeLabel, filtersForDoc, type DocTypeMeta, type FormField } from '@jci/core';
import { DocForm, EmptyState, ErrorState, Heading, Page, Spinner, Text, Timeline } from '@jci/ui';
import { useDesk } from './DeskContext';
import { docTitle } from './docTypes';
import { renderDeskField } from './LinkField';
import { useDocForm } from './useDocForm';

const ACTION: Readonly<Record<string, string>> = { create: 'Created', update: 'Updated', delete: 'Deleted' };

export function DocFormScreen({ meta, id }: { meta: DocTypeMeta; id: string | null }) {
  const form = useDocForm(meta, id);
  const label = docTypeLabel(meta);

  if (form.status === 'loading') {
    return (
      <Page>
        <Spinner label={`Loading ${label}`} />
      </Page>
    );
  }
  if (form.status === 'unavailable') {
    return (
      <Page>
        <EmptyState title={form.title} description={form.message} />
      </Page>
    );
  }

  return (
    <Page>
      <Heading level={1}>{form.isNew ? `New ${label}` : form.stored ? docTitle(meta, form.stored) : label}</Heading>
      {!form.submit ? <Text tone="muted">{`You can view this ${label} but not change it.`}</Text> : null}
      <DocForm
        sections={form.sections}
        values={form.values}
        errors={form.errors.fields}
        formError={form.errors.form}
        onChange={form.setValue}
        onSubmit={form.submit}
        submitLabel={form.isNew ? `Create ${label}` : 'Save changes'}
        submitting={form.submitting}
        renderField={renderDeskField}
      />
      {form.stored && meta.trackChanges ? <DocTimeline meta={meta} stored={form.stored} fields={form.fields} /> : null}
    </Page>
  );
}

function DocTimeline({ meta, stored, fields }: { meta: DocTypeMeta; stored: QueryDoc; fields: FormField[] }) {
  const { user } = useDesk();
  const filters = filtersForDoc(meta, user, stored.data);
  const versions = useVersions(meta.name, stored.id, filters);
  if (versions.status === 'loading') return <Spinner label="Loading history" />;
  if (versions.status === 'error') return <ErrorState title="Could not load the history" message={versions.message} />;
  const labels = Object.fromEntries(fields.map((f) => [f.key, f.def.label]));
  const items = timelineEntries(versions.docs, labels).map((e) => ({
    id: e.id,
    title: `${ACTION[e.action] ?? 'Changed'} by ${e.by || 'unknown'}`,
    when: e.at ? e.at.toLocaleString() : '',
    changes: e.changes,
  }));
  return <Timeline items={items} />;
}
```

- [ ] **Step 4: Add the routes and link the list to the form**

Create `apps/app/app/(desk)/desk/[doctype]/new.tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { EmptyState, Page } from '@jci/ui';
import { DocFormScreen } from '../../../../src/desk/DocFormScreen';
import { deskDocType } from '../../../../src/desk/docTypes';

export default function NewDoc() {
  const { doctype } = useLocalSearchParams<{ doctype: string }>();
  const meta = deskDocType(doctype);
  if (!meta) {
    return (
      <Page>
        <EmptyState title="Unknown DocType" description={`There is no DocType called "${String(doctype)}".`} />
      </Page>
    );
  }
  return <DocFormScreen key={`${meta.name}/new`} meta={meta} id={null} />;
}
```

Create `apps/app/app/(desk)/desk/[doctype]/[id].tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { EmptyState, Page } from '@jci/ui';
import { DocFormScreen } from '../../../../src/desk/DocFormScreen';
import { deskDocType } from '../../../../src/desk/docTypes';

export default function EditDoc() {
  const { doctype, id } = useLocalSearchParams<{ doctype: string; id: string }>();
  const meta = deskDocType(doctype);
  if (!meta || typeof id !== 'string') {
    return (
      <Page>
        <EmptyState title="Unknown DocType" description={`There is no DocType called "${String(doctype)}".`} />
      </Page>
    );
  }
  // Keyed by document so moving between records starts a fresh form.
  return <DocFormScreen key={`${meta.name}/${id}`} meta={meta} id={id} />;
}
```

Replace `apps/app/app/(desk)/desk/[doctype]/index.tsx`:

```tsx
import { LIST_LIMIT } from '@jci/client';
import { useDocs } from '@jci/client/react';
import { can, docTypeLabel, listFilters } from '@jci/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, EmptyState, ErrorState, Heading, ListItem, Page, Spinner, Stack, Text } from '@jci/ui';
import { useDesk } from '../../../../src/desk/DeskContext';
import { deskDocType, docTitle } from '../../../../src/desk/docTypes';
import { useScopeOrgPath } from '../../../../src/desk/useScopeOrgPath';

export default function DocTypeList() {
  const { doctype } = useLocalSearchParams<{ doctype: string }>();
  const router = useRouter();
  const { user, scope } = useDesk();
  const scopePath = useScopeOrgPath();
  const meta = deskDocType(doctype);
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
  const canCreateHere =
    (!meta.orgScoped || Array.isArray(scopePath)) &&
    can(meta, user, 'create', { orgPath: meta.orgScoped ? (scopePath ?? []) : null, ownerPersonId: user.personId });
  const newButton = canCreateHere ? (
    <Button label={`New ${label}`} size="sm" onPress={() => router.push({ pathname: '/desk/[doctype]/new', params: { doctype: meta.name } })} />
  ) : null;

  if (!filters) {
    return (
      <Page>
        <Heading level={1}>{label}</Heading>
        <EmptyState title="Not available here" description={`You can't see ${label} in this organisation. Pick another one from the menu.`} />
        {newButton}
      </Page>
    );
  }

  return (
    <Page>
      <Stack direction="row" justify="between" align="center" wrap>
        <Heading level={1}>{label}</Heading>
        <Stack direction="row" gap="sm" align="center">
          {docs.status === 'ready' ? (
            <Text tone="muted">{docs.docs.length === LIST_LIMIT ? `First ${LIST_LIMIT}` : String(docs.docs.length)}</Text>
          ) : null}
          {newButton}
        </Stack>
      </Stack>
      {docs.status === 'loading' ? <Spinner label={`Loading ${label}`} /> : null}
      {docs.status === 'error' ? <ErrorState message={docs.message} /> : null}
      {docs.status === 'ready' && docs.docs.length === 0 ? <EmptyState title={`No ${label} yet`} /> : null}
      {docs.status === 'ready'
        ? docs.docs.map((d) => {
            const title = docTitle(meta, d);
            return (
              <ListItem
                key={d.id}
                testID={`row-${d.id}`}
                title={title}
                subtitle={title === d.id ? undefined : d.id}
                onPress={() => router.push({ pathname: '/desk/[doctype]/[id]', params: { doctype: meta.name, id: d.id } })}
              />
            );
          })
        : null}
    </Page>
  );
}
```

- [ ] **Step 5: Run the checks**

Run: `npm run check`
Expected: PASS. If typecheck rejects the new route names, delete `apps/app/.expo/types` and rerun.

Run: `npm run build:web`
Expected: PASS.

- [ ] **Step 6: Smoke-check the form on web**

1. Start the emulators in the background (Java prefix): `npm run emulators`.
2. Run `npm run seed:dev`, then `cp .env.example .env`.
3. Start `npm run dev:api -- --offline` in the background. `.env` allows `http://localhost:8081`.
4. Start `cd apps/app && npx expo start --web --port 8081` in the background.
5. In the browser pane, at desktop width, sign in as `admin@jci.test` and check:
   - **Organization** has a **New Organization** button. Its rows open the form.
   - **JCI Kuala Lumpur** shows Code, Name, Level, Parent (read-only picker), Currency and Time zone, then **Timeline** saying "No changes recorded yet."
   - Changing **Name** to `JCI Kuala Lumpur (KL)` and pressing **Save changes** adds an entry "Updated by …" with `Name: JCI Kuala Lumpur → JCI Kuala Lumpur (KL)`.
   - Pressing **Save changes** again shows "There are no changes to save."
   - Changing **Level** to `national` and saving shows "The level cannot change" under Level. The server rejects it through the controller.
   - Clearing **Name** and saving shows "Required" under Name, before any request.

Full end-to-end coverage is in Task 7. Stop every server you started and delete `.env`.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/desk apps/app/app
git commit -m "feat(app): create and edit documents in the Desk, with live version history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end checks, docs and follow-ups

**Files:**
- Modify: `README.md`, `docs/superpowers/plans/m3-followups.md`

**Interfaces:**
- Consumes: everything above.
- Produces: checks and documentation only.

- [ ] **Step 1: Check the whole flow on web**

Start the same servers as Task 6 Step 6: emulators (Java prefix), `npm run seed:dev`, `.env`, `npm run dev:api -- --offline`, and Expo web on 8081. Then check each case below in the browser pane.

As `admin@jci.test`, desktop width:
1. **Custom Field → New Custom Field.** Fill in:
   - DocType `Organization`
   - Field name `motto`
   - Label `Motto`
   - Type (Select) `Data`
   - Organisation (LinkPicker, search "JCI", pick **JCI**)

   Press **Create Custom Field**. The page moves to `/desk/CustomField/Organization.motto`, and its Timeline shows "Created by …".
2. **Organization → JCI Kuala Lumpur.** The form now has a **Motto** field. Set it to `Lead to impact` and save. The Timeline shows `Motto: — → Lead to impact`.
3. **Organization → New Organization**, with the scope still **JCI**:
   - Code `jci-test-area`
   - Name `Test Area`
   - Level `area`

   Create it. The page moves to `/desk/Organization/jci-test-area`, and **Parent** shows **JCI**.
4. **Role Assignment → New Role Assignment:**
   - User ID `someone`
   - Role (Select) `Member`
   - tick **Includes child organisations**

   Create it. The form reopens as `/desk/RoleAssignment/<id>`, and the list shows it.
5. **Role Assignment → New Role Assignment** with an empty User ID and no Role. Pressing Create shows field errors under User ID and Role, and no request is sent.

As `member@jci.test` (sign out first):
6. **Organization → JCI Kuala Lumpur** says "You can view this Organization but not change it." Every control is disabled, and there is no submit button.
7. The Organization list has no **New Organization** button.
8. **Custom Field → Organization.motto** is read-only too.

At 375 px wide, as admin:
9. **Menu → Organization → JCI Kuala Lumpur.** The form fits the width, and the **Level** Select sheet opens and closes.

- [ ] **Step 2: Check editing on the Android emulator**

With the same servers running and Metro started (`cd apps/app && npx expo start --port 8081` in the background), open Expo Go on `emulator-5554`:

```bash
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 shell am start -a android.intent.action.VIEW -d "exp://10.0.2.2:8081" host.exp.exponent
```

Sign in as `admin@jci.test`, then go to **Menu → Organization → JCI Kuala Lumpur**:
- Change Name and save. The Timeline gains an entry.
- The **Level** Select sheet opens as a modal and closes.

Check each step with an `adb exec-out screencap -p` screenshot.

If a request fails with a network error, check that `dev:api` is running. The app calls `http://10.0.2.2:8888` from the emulator.

Stop every server you started, and leave the Android emulator running. Delete `.env`.

- [ ] **Step 3: Update the README**

In `README.md`, section "Running the app locally", replace the line "Saving (M3b) goes through `/api/resource`, so run `npm run dev:api` alongside when you need writes." with:

```markdown
Opening a record shows its form and history. Creating and saving go through `/api/resource`, so run `npm run dev:api -- --offline` alongside (with `cp .env.example .env` first; it allows the Expo web origin). The form checks your changes with the same schema the server uses, and only the fields your roles may change are editable.
```

- [ ] **Step 4: Record the follow-ups**

Append this section to `docs/superpowers/plans/m3-followups.md`:

```markdown
## Deferred from M3b
- **Delete** is not in the Desk yet (the API supports it). Add it with a confirmation step.
- **Tabs** (`FieldDef.tab`) are ignored; only sections group fields.
- **Date and Datetime** are text inputs with a format hint. **AttachImage** is an image URL. Native pickers and upload come later.
- **No DocType has a Table field yet.** `ChildTable` is covered by unit tests and `/gallery-fields` only; exercise it end-to-end when M4 adds one.
- **Concurrent edits:**
  - The form keeps the values it loaded. A change saved elsewhere meanwhile is only noticed through the diff: fields the user did not touch are not sent, and fields they did touch overwrite it.
  - Detecting conflicts needs a version check in the API.
- **Link pickers** list up to `LIST_LIMIT` documents of the target in the current scope, with no server-side search.
- **Creating an Organization** checks create permission against the scope (parent) org. An admin with an exact grant at the parent sees **New** but the server refuses; the form shows that message.
- **The `/desk/[doctype]/new` route** shadows a document whose id is `new`.
- **Invalid custom field definitions** make the form show "Could not load the form" with the validation message, instead of silently dropping the field.
```

- [ ] **Step 5: Final verification**

Run: `npm run check`
Expected: PASS.

Run (Java prefix first): `npm run test:emulator`
Expected: PASS, including `formData`.

Run: `npm run build:functions`
Expected: PASS.

Run: `npm run build:web`
Expected: PASS.

Run: `git status --short`
Expected: only `README.md` and `docs/superpowers/plans/m3-followups.md`. No `.env`, and no `dist/`.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/superpowers/plans/m3-followups.md
git commit -m "docs: editing in the Desk; M3b follow-ups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## M3b exit criteria
- `npm run check`, `npm run test:emulator`, `npm run build:functions` and `npm run build:web` are all green.
- The version and custom-field queries are proven against the generated rules (`tests/emulator/formData.test.ts`).
- On web:
  - custom fields appear in forms;
  - create and edit work for Organization, Role Assignment and Custom Field;
  - Select, Checkbox and LinkPicker work;
  - client-side and server errors land on the right fields;
  - the Timeline records every save;
  - read-only access shows a disabled form with no submit button.
- On the Android emulator, editing and the Select sheet work.

## Next plan
- **M3c:**
  - `DocList`: a TanStack table on web and a simplified list on native.
  - Sorting, paging, search over the cached org-scoped list, a FilterBar and CSV export.
  - A descendant-org scope picker.
  - Delete from the Desk.
