# M1 Foundation Implementation Plan (scaffold + @jci/core engine + @jci/ui library)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the npm-workspaces monorepo with three pieces, all tested and runnable:
- the pure-TypeScript DocType engine (`@jci/core`)
- the single UI/UX component library (`@jci/ui`), with lint enforcement
- an Expo app that boots on web and shows a `/ui-gallery` catalogue

**Architecture:**
- `packages/core` is framework-free TypeScript that both the app and the Netlify Functions will use (from M2): DocType meta, Zod schema generation, the permission evaluator, the org hierarchy, version diffs and naming series. Tested with Vitest.
- `packages/ui` owns every visual element: tokens, primitives, components and a NativeWind Tailwind preset. Tested with jest-expo and React Native Testing Library.
- `apps/app` is an Expo Router app that may only compose `@jci/ui`. A local ESLint plugin enforces this.

**Tech Stack:** Node ≥ 20.19, npm workspaces, TypeScript ~5.8, Zod 4, Vitest 3, Expo (latest SDK via create-expo-app) + Expo Router, NativeWind 4 + Tailwind CSS 3.4, clsx + tailwind-merge, jest-expo + @testing-library/react-native, ESLint 9 flat config + typescript-eslint 8.

Spec: `docs/superpowers/specs/2026-09-29-jci-platform-core-member-crm-design.md`

## Global Constraints

- Repo root: `C:\Users\User\Documents\Cursor projects\Frappe` (its own git repo, branch `main`). All paths below are relative to it.
- Commands use Git Bash syntax. Run them from the repo root unless a step says otherwise.
- Brand colours: navy `#1B3A6B` and gold `#D4AF37`. Light and dark themes.
- **Hard rule:** app code (`apps/app`, `packages/doctypes`) builds its UI only from `@jci/ui`. The following may be imported only inside `packages/ui`:
  - React Native view primitives
  - NativeWind
  - `className`/`style` props
  - UI libraries: icons, TanStack, reanimated, clsx, tailwind-merge
- No hex colour literals anywhere except `packages/ui/src/tokens/tokens.json`.
- Components take semantic props (`variant`, `size`, `tone`), never free styling.
- Tailwind class strings must be **literal** (lookup maps), never string-built. Tailwind can't detect dynamic class names and would drop them from the build.
- Touch targets are at least 44 px (`min-h-11`). Text and background pairs meet WCAG AA, a contrast ratio of at least 4.5.
- Screens use a 16 px side gutter (`px-4`).
- The org hierarchy has these levels: `hq > area > national > national_area > local`. `orgPath` is the list of ancestor ids **including the org's own id as the last element**.
- DocType names are PascalCase. Fieldnames are camelCase. These fieldnames are reserved: `id, orgId, orgPath, ownerPersonId, createdAt, createdBy, updatedAt, updatedBy, custom`.
- Roles: `SystemManager, OrgAdmin, MembershipOfficer, Treasurer, BoardMember, Member, Guest`.
- Commit after every task. End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure (end state of M1)

```
package.json                         workspaces + root scripts
tsconfig.base.json                   shared strict TS options
vitest.config.ts                     Node test runner for packages/core + tools
eslint.config.mjs                    flat config; UI enforcement for app code
.gitignore  .gitattributes  .github/workflows/ci.yml
tools/eslint-plugin-jci/
  index.mjs                          plugin entry
  rules/no-raw-styling.mjs           bans className/style/contentContainerStyle JSX props
  rules/no-hex-colors.mjs            bans '#rgb' / '#rrggbb' / '#rrggbbaa' string literals
  restricted-imports.mjs             no-restricted-imports options for app code
  rules.test.mjs                     RuleTester unit tests
  enforcement.test.mjs               lints fixture code at real repo paths
packages/core/
  package.json  tsconfig.json
  src/index.ts                       public exports
  src/errors.ts                      MetaError
  src/naming/series.ts (+ .test.ts)  naming series parse/format
  src/meta/types.ts                  FieldDef, DocPerm, DocTypeMeta, ROLES, SYSTEM_FIELDS
  src/meta/defineDocType.ts          meta validation + defaults + freeze
  src/meta/registry.ts               cross-DocType checks + lookup
  src/meta/customFields.ts           custom field validation/merge/fieldKey
  src/meta/meta.test.ts  src/meta/customFields.test.ts
  src/org/hierarchy.ts (+ .test.ts)  levels, allowed parents, orgPath helpers
  src/validate/buildSchema.ts (+ .test.ts)  Zod schema from meta
  src/perm/evaluate.ts (+ .test.ts)  role × org scope × permlevel evaluator
  src/diff/diffDocs.ts (+ .test.ts)  field-level version diff
packages/ui/
  package.json  tsconfig.json  babel.config.js  jest.config.js  jest.setup.js
  nativewind-env.d.ts  tailwind-preset.js  README.md
  src/index.ts
  src/tokens/tokens.json             THE only place colours live
  src/tokens/index.ts  src/tokens/contrast.ts  src/tokens/__tests__/contrast.test.ts
  src/lib/cn.ts
  src/theme/useTheme.ts
  src/primitives/{Box,Stack,Text,Heading,Screen}.tsx  src/primitives/__tests__/primitives.test.tsx
  src/components/{Button,Input,Card,Badge,EmptyState}.tsx  src/components/__tests__/components.test.tsx
apps/app/                            generated by create-expo-app, then trimmed
  package.json  app.json  tsconfig.json  babel.config.js  metro.config.js
  tailwind.config.js  global.css  nativewind-env.d.ts
  app/_layout.tsx  app/index.tsx  app/(dev)/ui-gallery.tsx
```

---

### Task 1: Monorepo scaffold + naming series (first @jci/core module)

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `.gitattributes`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/errors.ts`, `packages/core/src/naming/series.ts`
- Test: `packages/core/src/naming/series.test.ts`

**Interfaces:**
- Produces:
  - `class MetaError extends Error`
  - `interface DateParts { year: number; month: number; day: number }`
  - `parseSeriesPattern(pattern: string): { tokens: string[]; hashIndex: number; width: number }`. Throws `MetaError`.
  - `seriesPrefix(pattern: string, date: DateParts): string`
  - `formatSeriesName(pattern: string, date: DateParts, counter: number): string`

- [ ] **Step 1: Create root config files**

`package.json`:
```json
{
  "name": "jci-platform",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=20.19" },
  "scripts": {
    "test": "npm run test:node",
    "test:node": "vitest run",
    "typecheck": "tsc -p packages/core --noEmit",
    "check": "npm run typecheck && npm test"
  },
  "devDependencies": {
    "typescript": "~5.8.0",
    "vitest": "^3.2.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/core/src/**/*.test.ts', 'tools/**/*.test.mjs'],
  },
});
```

`.gitignore`:
```
node_modules/
.expo/
dist/
web-build/
*.log
.env*
!.env.example
coverage/
```

`.gitattributes`:
```
* text=auto eol=lf
```

`packages/core/package.json`:
```json
{
  "name": "@jci/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "zod": "^4.0.0"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/core/src/errors.ts`:
```ts
/** Thrown when DocType metadata (or a naming pattern / custom field) is invalid. */
export class MetaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaError';
  }
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: this creates `node_modules/` and `package-lock.json` and exits with code 0.

- [ ] **Step 3: Write the failing test**

`packages/core/src/naming/series.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MetaError } from '../errors';
import { formatSeriesName, parseSeriesPattern, seriesPrefix } from './series';

const d = { year: 2026, month: 9, day: 5 };

describe('naming series', () => {
  it('formats a Frappe-style pattern', () => {
    expect(formatSeriesName('MEM-.YYYY.-.#####', d, 1)).toBe('MEM-2026-00001');
    expect(formatSeriesName('DUE-.YY.MM.-.###', d, 42)).toBe('DUE-2609-042');
    expect(formatSeriesName('X-.DD.-.##', d, 7)).toBe('X-05-07');
  });

  it('does not truncate counters wider than the hash block', () => {
    expect(formatSeriesName('A-.##', d, 1234)).toBe('A-1234');
  });

  it('computes the counter prefix used as the counter key', () => {
    expect(seriesPrefix('MEM-.YYYY.-.#####', d)).toBe('MEM-2026-');
  });

  it('reports hash width and position', () => {
    expect(parseSeriesPattern('MEM-.YYYY.-.#####')).toEqual({
      tokens: ['MEM-', 'YYYY', '-', '#####'],
      hashIndex: 3,
      width: 5,
    });
  });

  it('rejects patterns without exactly one trailing hash block', () => {
    expect(() => parseSeriesPattern('MEM-.YYYY')).toThrow(MetaError);
    expect(() => parseSeriesPattern('A-.##.-.##')).toThrow(MetaError);
    expect(() => parseSeriesPattern('A-.##.-X')).toThrow(MetaError);
  });

  it('rejects non-positive or fractional counters', () => {
    expect(() => formatSeriesName('A-.##', d, 0)).toThrow(RangeError);
    expect(() => formatSeriesName('A-.##', d, 1.5)).toThrow(RangeError);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run packages/core/src/naming`
Expected: FAIL with `Failed to resolve import "./series"`.

- [ ] **Step 5: Implement**

`packages/core/src/naming/series.ts`:
```ts
import { MetaError } from '../errors';

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface ParsedSeries {
  tokens: string[];
  hashIndex: number;
  width: number;
}

/**
 * Frappe-style pattern: dot-separated tokens. YYYY / YY / MM / DD are date parts,
 * a run of '#' is the zero-padded counter (must be exactly one, and last),
 * anything else is literal. Example: 'MEM-.YYYY.-.#####' -> 'MEM-2026-00001'.
 */
export function parseSeriesPattern(pattern: string): ParsedSeries {
  const tokens = pattern.split('.');
  const hashIndexes = tokens.flatMap((t, i) => (/^#+$/.test(t) ? [i] : []));
  if (hashIndexes.length !== 1) {
    throw new MetaError(`Series pattern "${pattern}" must contain exactly one "#" block`);
  }
  const hashIndex = hashIndexes[0]!;
  if (hashIndex !== tokens.length - 1) {
    throw new MetaError(`Series pattern "${pattern}": the "#" block must be the last token`);
  }
  return { tokens, hashIndex, width: tokens[hashIndex]!.length };
}

function renderToken(token: string, date: DateParts): string {
  switch (token) {
    case 'YYYY':
      return String(date.year).padStart(4, '0');
    case 'YY':
      return String(date.year % 100).padStart(2, '0');
    case 'MM':
      return String(date.month).padStart(2, '0');
    case 'DD':
      return String(date.day).padStart(2, '0');
    default:
      return token;
  }
}

/** Everything before the counter; used as the key of the counter document. */
export function seriesPrefix(pattern: string, date: DateParts): string {
  const { tokens, hashIndex } = parseSeriesPattern(pattern);
  return tokens
    .slice(0, hashIndex)
    .map((t) => renderToken(t, date))
    .join('');
}

export function formatSeriesName(pattern: string, date: DateParts, counter: number): string {
  if (!Number.isInteger(counter) || counter < 1) {
    throw new RangeError(`counter must be a positive integer, got ${counter}`);
  }
  const { width } = parseSeriesPattern(pattern);
  return seriesPrefix(pattern, date) + String(counter).padStart(width, '0');
}
```

`packages/core/src/index.ts`:
```ts
export * from './errors';
export * from './naming/series';
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run check`
Expected: typecheck passes with no output, and Vitest reports `6 passed`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts .gitignore .gitattributes packages/core
git commit -m "feat(core): scaffold monorepo and naming series

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: DocType meta — types, defineDocType, registry

**Files:**
- Create: `packages/core/src/meta/types.ts`, `packages/core/src/meta/defineDocType.ts`, `packages/core/src/meta/registry.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/meta/meta.test.ts`

**Interfaces:**
- Consumes: `MetaError`, `parseSeriesPattern` (Task 1).
- Produces:
  - Types: `FIELD_TYPES`, `FieldType`, `ROLES`, `RoleName`, `SYSTEM_FIELDS`, `FieldDef`, `DocPerm`, `Naming`, `DocTypeInput`, `DocTypeMeta`
  - `validateField(doctype: string, field: FieldDef): void`
  - `defineDocType(input: DocTypeInput): DocTypeMeta`
  - `interface Registry { get(name): DocTypeMeta; has(name): boolean; all(): readonly DocTypeMeta[] }`
  - `createRegistry(metas: readonly DocTypeMeta[]): Registry`

- [ ] **Step 1: Write the types**

`packages/core/src/meta/types.ts`:
```ts
export const FIELD_TYPES = [
  'Data',
  'Text',
  'Int',
  'Float',
  'Currency',
  'Date',
  'Datetime',
  'Check',
  'Select',
  'Link',
  'Table',
  'AttachImage',
  'JSON',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const ROLES = [
  'SystemManager',
  'OrgAdmin',
  'MembershipOfficer',
  'Treasurer',
  'BoardMember',
  'Member',
  'Guest',
] as const;
export type RoleName = (typeof ROLES)[number];

/** Server-managed fields present on every stored document. Never declared as DocType fields. */
export const SYSTEM_FIELDS = [
  'id',
  'orgId',
  'orgPath',
  'ownerPersonId',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
] as const;

export interface FieldDef {
  fieldname: string;
  label: string;
  fieldtype: FieldType;
  reqd?: boolean;
  unique?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  /** Permission level; 0 = normal, higher levels need an explicit DocPerm row. Default 0. */
  permlevel?: number;
  /** Select only. */
  options?: readonly string[];
  /** Link only: target DocType name. */
  link?: string;
  /** Table only: child DocType name (must have isChild: true). */
  childDocType?: string;
  /** Show the field only when another field is truthy / equals a value. */
  dependsOn?: { field: string; equals?: unknown };
  section?: string;
  tab?: string;
  /** Set by mergeCustomFields; value is stored under doc.custom[fieldname]. */
  isCustom?: boolean;
}

export interface DocPerm {
  role: RoleName;
  permlevel?: number;
  read?: boolean;
  write?: boolean;
  create?: boolean;
  delete?: boolean;
  /** Row applies only when doc.ownerPersonId === user.personId. */
  ifOwner?: boolean;
}

export type Naming =
  | { kind: 'autoId' }
  | { kind: 'series'; pattern: string }
  | { kind: 'field'; field: string };

export interface DocTypeInput {
  name: string;
  module: string;
  /** Firestore collection; required unless isChild. */
  collection?: string;
  naming?: Naming;
  fields: readonly FieldDef[];
  permissions?: readonly DocPerm[];
  titleField?: string;
  searchFields?: readonly string[];
  listFields?: readonly string[];
  isChild?: boolean;
  trackChanges?: boolean;
  orgScoped?: boolean;
}

export interface DocTypeMeta {
  readonly name: string;
  readonly module: string;
  readonly collection: string;
  readonly naming: Naming;
  readonly fields: readonly FieldDef[];
  readonly permissions: readonly DocPerm[];
  readonly titleField: string | null;
  readonly searchFields: readonly string[];
  readonly listFields: readonly string[];
  readonly isChild: boolean;
  readonly trackChanges: boolean;
  readonly orgScoped: boolean;
}
```

- [ ] **Step 2: Write the failing test**

`packages/core/src/meta/meta.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MetaError } from '../errors';
import { defineDocType } from './defineDocType';
import { createRegistry } from './registry';
import type { DocTypeInput } from './types';

const personInput = (): DocTypeInput => ({
  name: 'Person',
  module: 'membership',
  collection: 'persons',
  naming: { kind: 'series', pattern: 'PER-.YYYY.-.#####' },
  titleField: 'fullName',
  listFields: ['fullName', 'email'],
  searchFields: ['fullName'],
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data', reqd: true },
    { fieldname: 'email', label: 'Email', fieldtype: 'Data' },
    { fieldname: 'gender', label: 'Gender', fieldtype: 'Select', options: ['Male', 'Female'] },
  ],
  permissions: [{ role: 'Member', read: true }],
});

describe('defineDocType', () => {
  it('applies defaults and freezes the result', () => {
    const m = defineDocType(personInput());
    expect(m.trackChanges).toBe(true);
    expect(m.isChild).toBe(false);
    expect(m.orgScoped).toBe(true);
    expect(m.titleField).toBe('fullName');
    expect(Object.isFrozen(m)).toBe(true);
    expect(Object.isFrozen(m.fields)).toBe(true);
  });

  it('defaults naming to autoId', () => {
    const { naming: _n, ...rest } = personInput();
    expect(defineDocType(rest).naming).toEqual({ kind: 'autoId' });
  });

  it('rejects non-PascalCase names', () => {
    expect(() => defineDocType({ ...personInput(), name: 'person' })).toThrow(MetaError);
  });

  it('rejects bad, duplicate and reserved fieldnames', () => {
    const base = personInput();
    const f = base.fields[0]!;
    expect(() => defineDocType({ ...base, fields: [{ ...f, fieldname: 'Full_Name' }] })).toThrow(/camelCase/);
    expect(() => defineDocType({ ...base, fields: [f, f] })).toThrow(/duplicate/);
    expect(() => defineDocType({ ...base, titleField: undefined, listFields: [], searchFields: [], fields: [{ ...f, fieldname: 'orgId' }] })).toThrow(/reserved/);
    expect(() => defineDocType({ ...base, titleField: undefined, listFields: [], searchFields: [], fields: [{ ...f, fieldname: 'custom' }] })).toThrow(/reserved/);
  });

  it('requires type-specific properties', () => {
    const base = { ...personInput(), titleField: undefined, listFields: [], searchFields: [] };
    expect(() => defineDocType({ ...base, fields: [{ fieldname: 'g', label: 'G', fieldtype: 'Select' }] })).toThrow(/options/);
    expect(() => defineDocType({ ...base, fields: [{ fieldname: 'o', label: 'O', fieldtype: 'Link' }] })).toThrow(/link/);
    expect(() => defineDocType({ ...base, fields: [{ fieldname: 't', label: 'T', fieldtype: 'Table' }] })).toThrow(/childDocType/);
  });

  it('rejects invalid permlevels', () => {
    const base = personInput();
    expect(() => defineDocType({ ...base, fields: [...base.fields, { fieldname: 'x', label: 'X', fieldtype: 'Data', permlevel: 10 }] })).toThrow(/permlevel/);
  });

  it('rejects references to unknown fields', () => {
    expect(() => defineDocType({ ...personInput(), titleField: 'nope' })).toThrow(/titleField/);
    expect(() => defineDocType({ ...personInput(), listFields: ['nope'] })).toThrow(/listField/);
    expect(() => defineDocType({ ...personInput(), searchFields: ['nope'] })).toThrow(/searchField/);
    expect(() => defineDocType({ ...personInput(), naming: { kind: 'field', field: 'nope' } })).toThrow(/naming/);
    const base = personInput();
    expect(() => defineDocType({ ...base, fields: [...base.fields, { fieldname: 'x', label: 'X', fieldtype: 'Data', dependsOn: { field: 'nope' } }] })).toThrow(/dependsOn/);
  });

  it('validates series patterns', () => {
    expect(() => defineDocType({ ...personInput(), naming: { kind: 'series', pattern: 'PER-.YYYY' } })).toThrow(MetaError);
  });

  it('requires a collection unless child, and forbids permissions on child DocTypes', () => {
    const { collection: _c, ...noCollection } = personInput();
    expect(() => defineDocType(noCollection)).toThrow(/collection/);
    expect(() =>
      defineDocType({ name: 'Row', module: 'm', isChild: true, fields: [], permissions: [{ role: 'Member', read: true }] }),
    ).toThrow(/child/);
    const row = defineDocType({ name: 'Row', module: 'm', isChild: true, fields: [] });
    expect(row.collection).toBe('');
    expect(row.orgScoped).toBe(false);
  });
});

describe('createRegistry', () => {
  const org = defineDocType({ name: 'Organization', module: 'core', collection: 'organizations', fields: [{ fieldname: 'orgName', label: 'Name', fieldtype: 'Data' }] });
  const row = defineDocType({ name: 'HistoryRow', module: 'm', isChild: true, fields: [{ fieldname: 'year', label: 'Year', fieldtype: 'Int' }] });
  const person = defineDocType({
    name: 'Person',
    module: 'membership',
    collection: 'persons',
    fields: [
      { fieldname: 'homeOrg', label: 'Org', fieldtype: 'Link', link: 'Organization' },
      { fieldname: 'history', label: 'History', fieldtype: 'Table', childDocType: 'HistoryRow' },
    ],
  });

  it('looks DocTypes up by name', () => {
    const r = createRegistry([org, row, person]);
    expect(r.get('Person')).toBe(person);
    expect(r.has('Nope')).toBe(false);
    expect(r.all()).toHaveLength(3);
    expect(() => r.get('Nope')).toThrow(MetaError);
  });

  it('rejects duplicates, unknown links and non-child tables', () => {
    expect(() => createRegistry([org, org])).toThrow(/Duplicate/);
    expect(() => createRegistry([row, person])).toThrow(/unknown DocType "Organization"/);
    const badTable = defineDocType({ name: 'Bad', module: 'm', collection: 'bad', fields: [{ fieldname: 't', label: 'T', fieldtype: 'Table', childDocType: 'Organization' }] });
    expect(() => createRegistry([org, badTable])).toThrow(/not a child DocType/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/core/src/meta`
Expected: FAIL with `Failed to resolve import "./defineDocType"`.

- [ ] **Step 4: Implement defineDocType and registry**

`packages/core/src/meta/defineDocType.ts`:
```ts
import { MetaError } from '../errors';
import { parseSeriesPattern } from '../naming/series';
import { FIELD_TYPES, SYSTEM_FIELDS, type DocTypeInput, type DocTypeMeta, type FieldDef } from './types';

const DOCTYPE_NAME = /^[A-Z][A-Za-z0-9]*$/;
const FIELDNAME = /^[a-z][A-Za-z0-9]*$/;
const RESERVED = new Set<string>([...SYSTEM_FIELDS, 'custom']);

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
  const level = f.permlevel ?? 0;
  if (!Number.isInteger(level) || level < 0 || level > 9) {
    throw new MetaError(`${where}: permlevel must be an integer 0-9`);
  }
}

export function defineDocType(input: DocTypeInput): DocTypeMeta {
  if (!DOCTYPE_NAME.test(input.name)) {
    throw new MetaError(`DocType name "${input.name}" must be PascalCase`);
  }
  const isChild = input.isChild ?? false;
  if (!isChild && !input.collection) throw new MetaError(`${input.name}: collection is required`);
  if (isChild && input.permissions && input.permissions.length > 0) {
    throw new MetaError(`${input.name}: child DocTypes inherit permissions from their parent`);
  }

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
  if (naming.kind === 'field') mustExist(naming.field, 'naming field');
  if (naming.kind === 'series') parseSeriesPattern(naming.pattern);

  return Object.freeze({
    name: input.name,
    module: input.module,
    collection: input.collection ?? '',
    naming: Object.freeze({ ...naming }),
    fields: Object.freeze(input.fields.map((f) => Object.freeze({ ...f }))),
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

`packages/core/src/meta/registry.ts`:
```ts
import { MetaError } from '../errors';
import type { DocTypeMeta } from './types';

export interface Registry {
  get(name: string): DocTypeMeta;
  has(name: string): boolean;
  all(): readonly DocTypeMeta[];
}

export function createRegistry(metas: readonly DocTypeMeta[]): Registry {
  const map = new Map<string, DocTypeMeta>();
  for (const m of metas) {
    if (map.has(m.name)) throw new MetaError(`Duplicate DocType "${m.name}"`);
    map.set(m.name, m);
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

Replace `packages/core/src/index.ts` with:
```ts
export * from './errors';
export * from './naming/series';
export * from './meta/types';
export * from './meta/defineDocType';
export * from './meta/registry';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm run check`
Expected: typecheck is clean, and all tests pass (6 naming + 11 meta).

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): DocType meta definition and registry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Organisation hierarchy helpers

**Files:**
- Create: `packages/core/src/org/hierarchy.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/org/hierarchy.test.ts`

**Interfaces:**
- Produces:
  - `ORG_LEVELS`, `OrgLevel`
  - `canBeChildOf(child: OrgLevel, parent: OrgLevel | null): boolean`
  - `buildOrgPath(parentPath: readonly string[] | null, orgId: string): string[]`
  - `isWithin(orgPath: readonly string[], orgId: string): boolean`
  - `ownOrgId(orgPath: readonly string[]): string`

- [ ] **Step 1: Write the failing test**

`packages/core/src/org/hierarchy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildOrgPath, canBeChildOf, isWithin, ownOrgId } from './hierarchy';

const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];

describe('org hierarchy', () => {
  it('enforces allowed parent levels', () => {
    expect(canBeChildOf('hq', null)).toBe(true);
    expect(canBeChildOf('area', 'hq')).toBe(true);
    expect(canBeChildOf('national', 'area')).toBe(true);
    expect(canBeChildOf('national_area', 'national')).toBe(true);
    expect(canBeChildOf('local', 'national_area')).toBe(true);
    expect(canBeChildOf('local', 'national')).toBe(true); // countries without areas
    expect(canBeChildOf('local', 'area')).toBe(false);
    expect(canBeChildOf('national', null)).toBe(false);
    expect(canBeChildOf('hq', 'hq')).toBe(false);
  });

  it('builds orgPath including the org itself', () => {
    expect(buildOrgPath(null, 'jci')).toEqual(['jci']);
    expect(buildOrgPath(KL.slice(0, 4), 'jci-kl')).toEqual(KL);
  });

  it('rejects cycles and empty ids', () => {
    expect(() => buildOrgPath(['jci', 'x'], 'jci')).toThrow(/cycle/);
    expect(() => buildOrgPath(['jci'], '')).toThrow(/empty/);
  });

  it('answers subtree membership and own org', () => {
    expect(isWithin(KL, 'jci-malaysia')).toBe(true);
    expect(isWithin(KL, 'jci-singapore')).toBe(false);
    expect(ownOrgId(KL)).toBe('jci-kl');
    expect(() => ownOrgId([])).toThrow(/empty/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/org`
Expected: FAIL with `Failed to resolve import "./hierarchy"`.

- [ ] **Step 3: Implement**

`packages/core/src/org/hierarchy.ts`:
```ts
export const ORG_LEVELS = ['hq', 'area', 'national', 'national_area', 'local'] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];

const ALLOWED_PARENTS: Record<OrgLevel, readonly OrgLevel[]> = {
  hq: [],
  area: ['hq'],
  national: ['area'],
  national_area: ['national'],
  local: ['national_area', 'national'],
};

export function canBeChildOf(child: OrgLevel, parent: OrgLevel | null): boolean {
  if (parent === null) return child === 'hq';
  return ALLOWED_PARENTS[child].includes(parent);
}

/** orgPath = ancestor ids from the root down, ending with the org's own id. */
export function buildOrgPath(parentPath: readonly string[] | null, orgId: string): string[] {
  if (!orgId) throw new Error('orgId must not be empty');
  const base = parentPath ?? [];
  if (base.includes(orgId)) throw new Error(`orgPath cycle: "${orgId}" is already an ancestor`);
  return [...base, orgId];
}

export function isWithin(orgPath: readonly string[], orgId: string): boolean {
  return orgPath.includes(orgId);
}

export function ownOrgId(orgPath: readonly string[]): string {
  const last = orgPath[orgPath.length - 1];
  if (last === undefined) throw new Error('orgPath is empty');
  return last;
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './org/hierarchy';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm run check`
Expected: all tests pass (21 total).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): organisation hierarchy helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Custom fields + Zod schema generation

**Files:**
- Create: `packages/core/src/meta/customFields.ts`, `packages/core/src/validate/buildSchema.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/meta/customFields.test.ts`, `packages/core/src/validate/buildSchema.test.ts`

**Interfaces:**
- Consumes: `defineDocType`, `validateField`, `FieldDef`, `DocTypeMeta`, `MetaError`.
- Produces:
  - `validateCustomField(meta: DocTypeMeta, field: FieldDef): void`
  - `mergeCustomFields(meta: DocTypeMeta, custom: readonly FieldDef[]): FieldDef[]`. Custom entries get `isCustom: true`.
  - `fieldKey(field: FieldDef): string`. Returns `'custom.<fieldname>'` for custom fields, otherwise the fieldname.
  - `interface BuildSchemaOptions { customFields?: readonly FieldDef[]; mode?: 'create' | 'update'; resolveChild?: (name: string) => DocTypeMeta }`
  - `buildSchema(meta: DocTypeMeta, opts?: BuildSchemaOptions): z.ZodObject`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/meta/customFields.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MetaError } from '../errors';
import { fieldKey, mergeCustomFields, validateCustomField } from './customFields';
import { defineDocType } from './defineDocType';

const meta = defineDocType({
  name: 'Person',
  module: 'membership',
  collection: 'persons',
  fields: [{ fieldname: 'fullName', label: 'Full name', fieldtype: 'Data' }],
});

describe('custom fields', () => {
  it('merges custom fields after core fields and marks them', () => {
    const merged = mergeCustomFields(meta, [{ fieldname: 'shirtSize', label: 'Shirt', fieldtype: 'Select', options: ['S', 'M'] }]);
    expect(merged.map(fieldKey)).toEqual(['fullName', 'custom.shirtSize']);
    expect(merged[1]!.isCustom).toBe(true);
  });

  it('rejects Table custom fields, collisions and invalid definitions', () => {
    expect(() => validateCustomField(meta, { fieldname: 'rows', label: 'Rows', fieldtype: 'Table', childDocType: 'X' })).toThrow(/Table/);
    expect(() => validateCustomField(meta, { fieldname: 'fullName', label: 'Dup', fieldtype: 'Data' })).toThrow(/collides/);
    expect(() => validateCustomField(meta, { fieldname: 'Bad Name', label: 'B', fieldtype: 'Data' })).toThrow(MetaError);
  });
});
```

`packages/core/src/validate/buildSchema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MetaError } from '../errors';
import { defineDocType } from '../meta/defineDocType';
import { buildSchema } from './buildSchema';

const historyRow = defineDocType({
  name: 'MemberHistory',
  module: 't',
  isChild: true,
  fields: [
    { fieldname: 'year', label: 'Year', fieldtype: 'Int', reqd: true },
    { fieldname: 'note', label: 'Note', fieldtype: 'Text' },
  ],
});
const member = defineDocType({
  name: 'Member',
  module: 't',
  collection: 'members',
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data', reqd: true },
    { fieldname: 'age', label: 'Age', fieldtype: 'Int' },
    { fieldname: 'gender', label: 'Gender', fieldtype: 'Select', options: ['Male', 'Female'] },
    { fieldname: 'dues', label: 'Dues', fieldtype: 'Currency' },
    { fieldname: 'joinDate', label: 'Join date', fieldtype: 'Date' },
    { fieldname: 'lastSeen', label: 'Last seen', fieldtype: 'Datetime' },
    { fieldname: 'active', label: 'Active', fieldtype: 'Check' },
    { fieldname: 'avatar', label: 'Avatar', fieldtype: 'AttachImage' },
    { fieldname: 'extra', label: 'Extra', fieldtype: 'JSON' },
    { fieldname: 'homeOrg', label: 'Org', fieldtype: 'Link', link: 'Organization' },
    { fieldname: 'history', label: 'History', fieldtype: 'Table', childDocType: 'MemberHistory' },
  ],
});
const resolveChild = (name: string) => {
  if (name === 'MemberHistory') return historyRow;
  throw new Error(`unexpected child ${name}`);
};
const create = buildSchema(member, { resolveChild });
const update = buildSchema(member, { resolveChild, mode: 'update' });

describe('buildSchema', () => {
  it('accepts a complete valid document', () => {
    const r = create.safeParse({
      fullName: 'Tan Ah Kow',
      age: 30,
      gender: 'Male',
      dues: 300.5,
      joinDate: '2026-01-15',
      lastSeen: '2026-09-29T10:00:00+08:00',
      active: true,
      avatar: 'https://example.com/a.png',
      extra: { a: 1 },
      homeOrg: 'jci-kl',
      history: [{ year: 2025, note: 'Joined' }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts null for optional fields', () => {
    expect(create.safeParse({ fullName: 'A', age: null, gender: null }).success).toBe(true);
  });

  it('requires reqd fields on create, and trims Data', () => {
    expect(create.safeParse({}).success).toBe(false);
    expect(create.safeParse({ fullName: '   ' }).success).toBe(false);
  });

  it('allows omitting reqd fields on update but not nulling them', () => {
    expect(update.safeParse({ age: 31 }).success).toBe(true);
    expect(update.safeParse({ fullName: null }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(create.safeParse({ fullName: 'A', foo: 1 }).success).toBe(false);
  });

  it('validates each field type', () => {
    const bad: Record<string, unknown>[] = [
      { gender: 'Other' },
      { dues: 300.555 },
      { age: 1.5 },
      { joinDate: '29/09/2026' },
      { lastSeen: 'yesterday' },
      { active: 'yes' },
      { avatar: 'not a url' },
      { homeOrg: '' },
      { history: [{ note: 'missing year' }] },
    ];
    for (const b of bad) expect(create.safeParse({ fullName: 'A', ...b }).success, JSON.stringify(b)).toBe(false);
  });

  it('nests custom fields under custom', () => {
    const s = buildSchema(member, {
      resolveChild,
      customFields: [{ fieldname: 'shirtSize', label: 'Shirt', fieldtype: 'Select', options: ['S', 'M', 'L'], isCustom: true }],
    });
    expect(s.safeParse({ fullName: 'A', custom: { shirtSize: 'M' } }).success).toBe(true);
    expect(s.safeParse({ fullName: 'A', custom: { shirtSize: 'XXL' } }).success).toBe(false);
    expect(s.safeParse({ fullName: 'A', custom: { other: 1 } }).success).toBe(false);
    expect(create.safeParse({ fullName: 'A', custom: {} }).success).toBe(false); // no custom fields defined
  });

  it('throws MetaError for Table fields without resolveChild', () => {
    expect(() => buildSchema(member)).toThrow(MetaError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/meta/customFields.test.ts packages/core/src/validate`
Expected: FAIL with `Failed to resolve import "./customFields"` and `"./buildSchema"`.

- [ ] **Step 3: Implement**

`packages/core/src/meta/customFields.ts`:
```ts
import { MetaError } from '../errors';
import { validateField } from './defineDocType';
import type { DocTypeMeta, FieldDef } from './types';

export function validateCustomField(meta: DocTypeMeta, field: FieldDef): void {
  validateField(meta.name, field);
  if (field.fieldtype === 'Table') throw new MetaError(`${meta.name}.${field.fieldname}: custom fields cannot be Table`);
  if (meta.fields.some((f) => f.fieldname === field.fieldname)) {
    throw new MetaError(`${meta.name}.${field.fieldname}: custom field collides with a core field`);
  }
}

export function mergeCustomFields(meta: DocTypeMeta, custom: readonly FieldDef[]): FieldDef[] {
  for (const f of custom) validateCustomField(meta, f);
  return [...meta.fields, ...custom.map((f) => ({ ...f, isCustom: true }))];
}

/** Path of the field's value inside a stored document. */
export function fieldKey(field: FieldDef): string {
  return field.isCustom ? `custom.${field.fieldname}` : field.fieldname;
}
```

`packages/core/src/validate/buildSchema.ts`:
```ts
import { z } from 'zod';
import { MetaError } from '../errors';
import type { DocTypeMeta, FieldDef } from '../meta/types';

export interface BuildSchemaOptions {
  customFields?: readonly FieldDef[];
  /** create: reqd fields must be present. update: a patch; reqd fields may be omitted but not nulled. */
  mode?: 'create' | 'update';
  resolveChild?: (name: string) => DocTypeMeta;
}

const hasAtMostTwoDecimals = (v: number): boolean => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

function baseSchema(f: FieldDef, opts: BuildSchemaOptions): z.ZodType {
  switch (f.fieldtype) {
    case 'Data': {
      const s = z.string().trim().max(140);
      return f.reqd ? s.min(1, 'Required') : s;
    }
    case 'Text': {
      const s = z.string().max(20000);
      return f.reqd ? s.min(1, 'Required') : s;
    }
    case 'Int':
      return z.number().int();
    case 'Float':
      return z.number().finite();
    case 'Currency':
      return z.number().finite().refine(hasAtMostTwoDecimals, 'At most 2 decimal places');
    case 'Date':
      return z.iso.date();
    case 'Datetime':
      return z.iso.datetime({ offset: true });
    case 'Check':
      return z.boolean();
    case 'Select':
      return z.enum(f.options as unknown as [string, ...string[]]);
    case 'Link':
      return z.string().min(1);
    case 'AttachImage':
      return z.url();
    case 'JSON':
      return z.record(z.string(), z.unknown());
    case 'Table': {
      if (!opts.resolveChild) throw new MetaError(`Table field "${f.fieldname}" needs resolveChild`);
      const child = opts.resolveChild(f.childDocType!);
      return z.array(buildSchema(child, { resolveChild: opts.resolveChild, mode: 'create' }));
    }
  }
}

function fieldSchema(f: FieldDef, opts: BuildSchemaOptions): z.ZodType {
  const s = baseSchema(f, opts);
  if (!f.reqd) return s.nullable().optional();
  return opts.mode === 'update' ? s.optional() : s;
}

export function buildSchema(meta: DocTypeMeta, opts: BuildSchemaOptions = {}) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of meta.fields) shape[f.fieldname] = fieldSchema(f, opts);
  const custom = opts.customFields ?? [];
  if (custom.length > 0) {
    const customShape: Record<string, z.ZodType> = {};
    for (const f of custom) customShape[f.fieldname] = fieldSchema(f, opts);
    shape.custom = z.strictObject(customShape).optional();
  }
  return z.strictObject(shape);
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './meta/customFields';
export * from './validate/buildSchema';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm run check`
Expected: all tests pass (21 earlier + 2 custom-field + 8 schema = 31).

If `z.iso.date` / `z.iso.datetime` / `z.url` are reported as missing, the installed Zod is v3. Run `npm ls zod` and make sure `zod@4.x` is installed.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): custom fields and Zod schema generation from meta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Permission evaluator (role × org scope × permlevel)

**Files:**
- Create: `packages/core/src/perm/evaluate.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/perm/evaluate.test.ts`

**Interfaces:**
- Consumes: `DocTypeMeta`, `FieldDef`, `RoleName`, `fieldKey`.
- Produces:
  - Types:
    - `RoleGrant { role: RoleName; orgId: string; withDescendants: boolean }`
    - `UserContext { uid: string; personId: string | null; grants: readonly RoleGrant[] }`
    - `DocContext { orgPath: readonly string[]; ownerPersonId?: string | null }`
    - `Action = 'read' | 'write' | 'create' | 'delete'`
  - `grantApplies(grant, orgPath): boolean`
  - `effectiveRoles(user, doc): Set<RoleName>`
  - `can(meta, user, action, doc): boolean`. Checks permlevel-0 rows only.
  - `permittedLevels(meta, user, action: 'read' | 'write', doc): Set<number>`
  - `readableFields(meta, fields: readonly FieldDef[], user, doc): FieldDef[]`
  - `patchKeys(patch: Record<string, unknown>): string[]`
  - `unwritableKeys(meta, fields: readonly FieldDef[], user, doc, patch): string[]`

Documents that are not org-scoped (global masters) are evaluated with `doc.orgPath = [<hq id>]`. The caller supplies that; the evaluator has no special cases.

- [ ] **Step 1: Write the failing test**

`packages/core/src/perm/evaluate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mergeCustomFields } from '../meta/customFields';
import { defineDocType } from '../meta/defineDocType';
import { can, effectiveRoles, grantApplies, patchKeys, readableFields, unwritableKeys, type UserContext } from './evaluate';

const KL = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-kl'];
const PJ = ['jci', 'jci-asia-pacific', 'jci-malaysia', 'jci-malaysia-central', 'jci-pj'];
const SG = ['jci', 'jci-asia-pacific', 'jci-singapore', 'jci-sg-local'];

const person = defineDocType({
  name: 'Person',
  module: 'membership',
  collection: 'persons',
  fields: [
    { fieldname: 'fullName', label: 'Full name', fieldtype: 'Data' },
    { fieldname: 'phone', label: 'Phone', fieldtype: 'Data' },
    { fieldname: 'membershipType', label: 'Type', fieldtype: 'Select', options: ['Probation', 'Official'], permlevel: 1 },
    { fieldname: 'authUid', label: 'Auth UID', fieldtype: 'Data', readOnly: true },
  ],
  permissions: [
    { role: 'Member', read: true },
    { role: 'Member', write: true, ifOwner: true },
    { role: 'Member', permlevel: 1, read: true },
    { role: 'MembershipOfficer', read: true, write: true, create: true },
    { role: 'MembershipOfficer', permlevel: 1, read: true, write: true },
  ],
});

const member: UserContext = { uid: 'u1', personId: 'p1', grants: [{ role: 'Member', orgId: 'jci-kl', withDescendants: false }] };
const nationalOfficer: UserContext = {
  uid: 'u2',
  personId: 'p2',
  grants: [{ role: 'MembershipOfficer', orgId: 'jci-malaysia', withDescendants: true }],
};
const klDoc = { orgPath: KL, ownerPersonId: 'p9' };
const ownDoc = { orgPath: KL, ownerPersonId: 'p1' };

describe('grant scope', () => {
  it('applies to own org, or the subtree when withDescendants', () => {
    expect(grantApplies({ role: 'Member', orgId: 'jci-kl', withDescendants: false }, KL)).toBe(true);
    expect(grantApplies({ role: 'Member', orgId: 'jci-malaysia', withDescendants: false }, KL)).toBe(false);
    expect(grantApplies({ role: 'Member', orgId: 'jci-malaysia', withDescendants: true }, KL)).toBe(true);
    expect(grantApplies({ role: 'Member', orgId: 'jci-malaysia', withDescendants: true }, SG)).toBe(false);
    expect(grantApplies({ role: 'Member', orgId: 'jci', withDescendants: true }, [])).toBe(false);
  });

  it('collects effective roles for a document', () => {
    expect([...effectiveRoles(nationalOfficer, klDoc)]).toEqual(['MembershipOfficer']);
    expect(effectiveRoles(member, { orgPath: PJ }).size).toBe(0);
  });
});

describe('can', () => {
  it('lets members read their own local but not another local', () => {
    expect(can(person, member, 'read', klDoc)).toBe(true);
    expect(can(person, member, 'read', { orgPath: PJ })).toBe(false);
  });

  it('lets a national officer act on every local below the national org only', () => {
    expect(can(person, nationalOfficer, 'write', klDoc)).toBe(true);
    expect(can(person, nationalOfficer, 'create', { orgPath: PJ })).toBe(true);
    expect(can(person, nationalOfficer, 'read', { orgPath: SG })).toBe(false);
    expect(can(person, nationalOfficer, 'delete', klDoc)).toBe(false);
  });

  it('applies ifOwner rows only to the owner', () => {
    expect(can(person, member, 'write', ownDoc)).toBe(true);
    expect(can(person, member, 'write', klDoc)).toBe(false);
    const anonymous: UserContext = { ...member, personId: null };
    expect(can(person, anonymous, 'write', { orgPath: KL, ownerPersonId: null })).toBe(false);
  });
});

describe('field-level permissions', () => {
  it('blocks permlevel-1 and readOnly fields for members', () => {
    expect(unwritableKeys(person, person.fields, member, ownDoc, { fullName: 'A', membershipType: 'Official' })).toEqual(['membershipType']);
    expect(unwritableKeys(person, person.fields, member, ownDoc, { phone: '012' })).toEqual([]);
  });

  it('allows permlevel-1 for officers but never readOnly fields', () => {
    expect(unwritableKeys(person, person.fields, nationalOfficer, klDoc, { membershipType: 'Official' })).toEqual([]);
    expect(unwritableKeys(person, person.fields, nationalOfficer, klDoc, { authUid: 'x' })).toEqual(['authUid']);
  });

  it('checks custom fields via custom.<name> keys', () => {
    const fields = mergeCustomFields(person, [{ fieldname: 'shirtSize', label: 'Shirt', fieldtype: 'Data', permlevel: 1 }]);
    expect(patchKeys({ fullName: 'A', custom: { shirtSize: 'L' } })).toEqual(['fullName', 'custom.shirtSize']);
    expect(unwritableKeys(person, fields, member, ownDoc, { custom: { shirtSize: 'L' } })).toEqual(['custom.shirtSize']);
  });

  it('returns readable fields by permlevel', () => {
    const outsider: UserContext = { uid: 'u3', personId: 'p3', grants: [{ role: 'Member', orgId: 'jci-pj', withDescendants: false }] };
    expect(readableFields(person, person.fields, member, klDoc).map((f) => f.fieldname)).toEqual([
      'fullName',
      'phone',
      'membershipType',
      'authUid',
    ]);
    expect(readableFields(person, person.fields, outsider, klDoc)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/perm`
Expected: FAIL with `Failed to resolve import "./evaluate"`.

- [ ] **Step 3: Implement**

`packages/core/src/perm/evaluate.ts`:
```ts
import { fieldKey } from '../meta/customFields';
import type { DocPerm, DocTypeMeta, FieldDef, RoleName } from '../meta/types';

export interface RoleGrant {
  role: RoleName;
  orgId: string;
  /** true: applies to orgId and every org below it. false: orgId only. */
  withDescendants: boolean;
}

export interface UserContext {
  uid: string;
  personId: string | null;
  grants: readonly RoleGrant[];
}

export interface DocContext {
  /** Ancestors from the root, ending with the doc's own org. */
  orgPath: readonly string[];
  ownerPersonId?: string | null;
}

export type Action = 'read' | 'write' | 'create' | 'delete';

export function grantApplies(grant: RoleGrant, orgPath: readonly string[]): boolean {
  if (orgPath.length === 0) return false;
  return grant.withDescendants ? orgPath.includes(grant.orgId) : orgPath[orgPath.length - 1] === grant.orgId;
}

export function effectiveRoles(user: UserContext, doc: DocContext): Set<RoleName> {
  const roles = new Set<RoleName>();
  for (const g of user.grants) if (grantApplies(g, doc.orgPath)) roles.add(g.role);
  return roles;
}

function rowMatches(row: DocPerm, roles: Set<RoleName>, user: UserContext, doc: DocContext): boolean {
  if (!roles.has(row.role)) return false;
  if (row.ifOwner) return user.personId !== null && doc.ownerPersonId === user.personId;
  return true;
}

export function can(meta: DocTypeMeta, user: UserContext, action: Action, doc: DocContext): boolean {
  const roles = effectiveRoles(user, doc);
  return meta.permissions.some((row) => (row.permlevel ?? 0) === 0 && row[action] === true && rowMatches(row, roles, user, doc));
}

export function permittedLevels(meta: DocTypeMeta, user: UserContext, action: 'read' | 'write', doc: DocContext): Set<number> {
  const roles = effectiveRoles(user, doc);
  const levels = new Set<number>();
  for (const row of meta.permissions) {
    if (row[action] === true && rowMatches(row, roles, user, doc)) levels.add(row.permlevel ?? 0);
  }
  return levels;
}

export function readableFields(meta: DocTypeMeta, fields: readonly FieldDef[], user: UserContext, doc: DocContext): FieldDef[] {
  const levels = permittedLevels(meta, user, 'read', doc);
  return fields.filter((f) => levels.has(f.permlevel ?? 0));
}

/** Top-level keys of a patch, with custom values expanded to 'custom.<name>'. */
export function patchKeys(patch: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'custom' && v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const ck of Object.keys(v)) keys.push(`custom.${ck}`);
    } else {
      keys.push(k);
    }
  }
  return keys;
}

/**
 * Keys in the patch the user may not write (readOnly or above their write permlevels).
 * Unknown keys are ignored here; schema validation rejects them.
 */
export function unwritableKeys(
  meta: DocTypeMeta,
  fields: readonly FieldDef[],
  user: UserContext,
  doc: DocContext,
  patch: Record<string, unknown>,
): string[] {
  const levels = permittedLevels(meta, user, 'write', doc);
  const byKey = new Map(fields.map((f) => [fieldKey(f), f]));
  return patchKeys(patch).filter((key) => {
    const f = byKey.get(key);
    if (!f) return false;
    return f.readOnly === true || !levels.has(f.permlevel ?? 0);
  });
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './perm/evaluate';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm run check`
Expected: all tests pass (31 earlier + 9 perm = 40).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): permission evaluator with org scope and permlevels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Version diff

**Files:**
- Create: `packages/core/src/diff/diffDocs.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/diff/diffDocs.test.ts`

**Interfaces:**
- Consumes: `SYSTEM_FIELDS`.
- Produces:
  - `type Change = [key: string, oldValue: unknown, newValue: unknown]`
  - `deepEqual(a: unknown, b: unknown): boolean`
  - `diffDocs(before: Record<string, unknown> | null, after: Record<string, unknown>): Change[]`. Takes the full before and after documents (not patches). Keys are sorted. `undefined` counts as `null`. System fields are ignored, and custom values appear as `custom.<name>`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/diff/diffDocs.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { deepEqual, diffDocs } from './diffDocs';

describe('deepEqual', () => {
  it('compares primitives, arrays, objects and dates structurally', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual(new Date(5), new Date(5))).toBe(true);
    expect(deepEqual(null, {})).toBe(false);
  });
});

describe('diffDocs', () => {
  it('lists changed fields sorted, ignoring system fields', () => {
    const before = { id: 'x', updatedAt: 1, fullName: 'A', phone: '1', tags: ['a'] };
    const after = { id: 'x', updatedAt: 2, fullName: 'B', phone: '1', tags: ['a', 'b'] };
    expect(diffDocs(before, after)).toEqual([
      ['fullName', 'A', 'B'],
      ['tags', ['a'], ['a', 'b']],
    ]);
  });

  it('treats a new document as all fields changed from null', () => {
    expect(diffDocs(null, { fullName: 'A', orgId: 'jci-kl' })).toEqual([['fullName', null, 'A']]);
  });

  it('treats undefined and null as equal and reports removals', () => {
    expect(diffDocs({ phone: null }, { phone: undefined })).toEqual([]);
    expect(diffDocs({ phone: '1' }, {})).toEqual([['phone', '1', null]]);
  });

  it('flattens custom fields', () => {
    expect(diffDocs({ custom: { shirt: 'M' } }, { custom: { shirt: 'L', size: 1 } })).toEqual([
      ['custom.shirt', 'M', 'L'],
      ['custom.size', null, 1],
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/diff`
Expected: FAIL with `Failed to resolve import "./diffDocs"`.

- [ ] **Step 3: Implement**

`packages/core/src/diff/diffDocs.ts`:
```ts
import { SYSTEM_FIELDS } from '../meta/types';

export type Change = [key: string, oldValue: unknown, newValue: unknown];

const SYSTEM = new Set<string>(SYSTEM_FIELDS);

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function flatten(doc: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!doc) return out;
  for (const [k, v] of Object.entries(doc)) {
    if (SYSTEM.has(k)) continue;
    if (k === 'custom' && v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ck, cv] of Object.entries(v)) out[`custom.${ck}`] = cv;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function diffDocs(before: Record<string, unknown> | null, after: Record<string, unknown>): Change[] {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changes: Change[] = [];
  for (const k of keys) {
    const oldValue = a[k] ?? null;
    const newValue = b[k] ?? null;
    if (!deepEqual(oldValue, newValue)) changes.push([k, oldValue, newValue]);
  }
  return changes;
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './diff/diffDocs';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm run check`
Expected: all tests pass (40 earlier + 5 diff = 45).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): field-level version diff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Expo app scaffold + @jci/ui tokens, Tailwind preset, contrast test

**Files:**
- Create (generated, then trimmed): `apps/app/**`
- Create: `apps/app/tailwind.config.js`, `apps/app/global.css`, `apps/app/babel.config.js`, `apps/app/metro.config.js`, `apps/app/nativewind-env.d.ts`
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/babel.config.js`, `packages/ui/jest.config.js`, `packages/ui/jest.setup.js`, `packages/ui/nativewind-env.d.ts`, `packages/ui/tailwind-preset.js`
- Create: `packages/ui/src/tokens/tokens.json`, `packages/ui/src/tokens/index.ts`, `packages/ui/src/tokens/contrast.ts`, `packages/ui/src/index.ts`
- Test: `packages/ui/src/tokens/__tests__/contrast.test.ts`
- Modify: root `package.json` (scripts)

**Interfaces:**
- Produces:
  - `tokens` (default export of `@jci/ui/src/tokens`), shaped `{ palette, semantic: { light, dark }, radius }`
  - `type SemanticColor`, a key of `tokens.semantic.light`
  - `luminance(hex: string): number` and `contrastRatio(a: string, b: string): number`
  - Tailwind colour classes: `bg-<name>` / `text-<name>` / `border-<name>`, plus a `-dark` variant, for each semantic name in kebab-case: `background, surface, surface-muted, border, text, text-muted, primary, on-primary, accent, on-accent, danger, on-danger, success, on-success, warning, on-warning, focus`. Also `navy-*` and `gold-*`.

- [ ] **Step 1: Generate the Expo app**

Run: `npx create-expo-app@latest apps/app --template default --no-install`
Expected: creates `apps/app` containing `app/`, `package.json` and `app.json`.

Then trim the example content:
```bash
rm -rf apps/app/.git apps/app/app apps/app/components apps/app/hooks apps/app/constants apps/app/scripts apps/app/app-example
```

Edit `apps/app/package.json`:
- set `"name": "@jci/app"`
- delete the `"reset-project"` and `"lint"` scripts
- add `"export:web": "expo export --platform web"` to `scripts`
- add `"@jci/core": "*"` and `"@jci/ui": "*"` to `dependencies`

Leave the other generated scripts and dependencies as they are.

- [ ] **Step 2: Create the @jci/ui package skeleton**

`packages/ui/package.json`:
```json
{
  "name": "@jci/ui",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tailwind-preset": "./tailwind-preset.js"
  },
  "scripts": {
    "test": "jest"
  },
  "peerDependencies": {
    "nativewind": "*",
    "react": "*",
    "react-native": "*",
    "react-native-safe-area-context": "*"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.0"
  }
}
```

`packages/ui/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["jest", "react-native"]
  },
  "include": ["src", "nativewind-env.d.ts"]
}
```

`packages/ui/nativewind-env.d.ts`:
```ts
/// <reference types="nativewind/types" />
```

`packages/ui/babel.config.js` (used only by Jest when running inside this package):
```js
module.exports = { presets: ['babel-preset-expo'] };
```

`packages/ui/jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|nativewind|react-native-css-interop|react-native-safe-area-context)',
  ],
};
```

`packages/ui/jest.setup.js`:
```js
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
```

- [ ] **Step 3: Install NativeWind and test dependencies**

Run each command in order:
```bash
npm install
cd apps/app && npx expo install nativewind@^4 react-native-reanimated react-native-safe-area-context && cd ../..
npm install -D -w @jci/app tailwindcss@^3.4.17
SDK=$(node -p "require('./apps/app/package.json').dependencies.expo.replace(/[^0-9.]/g,'').split('.')[0]")
npm install -D -w @jci/ui jest-expo@~$SDK.0.0 @testing-library/react-native @types/jest
```
Expected: every command exits with code 0. npm installs the `jest` and `react-test-renderer` peer dependencies automatically.

If `expo install` reports that `nativewind@^4` is incompatible with the generated SDK, stop and report the exact message. Do not upgrade to NativeWind 5 without a spec change.

- [ ] **Step 4: Write the failing contrast test**

`packages/ui/src/tokens/__tests__/contrast.test.ts`:
```ts
import tokens from '../tokens.json';
import { contrastRatio } from '../contrast';

type Scheme = keyof typeof tokens.semantic;
type Name = keyof typeof tokens.semantic.light;

const AA_PAIRS: [Name, Name][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['textMuted', 'surface'],
  ['textMuted', 'background'],
  ['onPrimary', 'primary'],
  ['onAccent', 'accent'],
  ['onDanger', 'danger'],
  ['onSuccess', 'success'],
  ['onWarning', 'warning'],
  ['primary', 'surface'],
  ['danger', 'surface'],
];

describe('design tokens', () => {
  it('uses the brand colours', () => {
    expect(tokens.palette.navy['600']).toBe(tokens.semantic.light.primary);
    expect(tokens.palette.gold['400']).toBe(tokens.semantic.light.accent);
  });

  it('defines the same semantic names in light and dark', () => {
    expect(Object.keys(tokens.semantic.dark).sort()).toEqual(Object.keys(tokens.semantic.light).sort());
  });

  it('computes ratio 1 for identical colours', () => {
    expect(contrastRatio(tokens.semantic.light.surface, tokens.semantic.light.surface)).toBeCloseTo(1);
  });

  for (const scheme of ['light', 'dark'] as Scheme[]) {
    for (const [fg, bg] of AA_PAIRS) {
      it(`${scheme}: ${fg} on ${bg} meets WCAG AA (>= 4.5)`, () => {
        const c = tokens.semantic[scheme];
        expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('rejects non #RRGGBB input', () => {
    expect(() => contrastRatio('red', 'blue')).toThrow(/RRGGBB/);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -w @jci/ui`
Expected: FAIL with `Cannot find module '../tokens.json'`.

- [ ] **Step 6: Write tokens, contrast helper and the Tailwind preset**

`packages/ui/src/tokens/tokens.json`:
```json
{
  "palette": {
    "navy": { "50": "#EEF2F8", "100": "#D5DFEE", "200": "#AABFDC", "300": "#7F9FCB", "400": "#4F75AE", "500": "#2C548E", "600": "#1B3A6B", "700": "#152E55", "800": "#10223F", "900": "#0A1629" },
    "gold": { "50": "#FBF7E9", "100": "#F5ECC8", "200": "#EDDC96", "300": "#E4CB63", "400": "#D4AF37", "500": "#B8952A", "600": "#8F7320", "700": "#665216", "800": "#40330E", "900": "#211A07" },
    "neutral": { "0": "#FFFFFF", "50": "#F7F8FA", "100": "#EDEFF3", "200": "#D9DDE5", "300": "#B8BFCC", "400": "#8A93A5", "500": "#5F6980", "600": "#465066", "700": "#323A4D", "800": "#1F2533", "900": "#121620", "950": "#0B0E14" },
    "red": { "400": "#F97066", "600": "#B42318" },
    "green": { "400": "#47CD89", "600": "#067647" },
    "amber": { "400": "#FDB022", "600": "#B54708" }
  },
  "semantic": {
    "light": {
      "background": "#F7F8FA",
      "surface": "#FFFFFF",
      "surfaceMuted": "#EDEFF3",
      "border": "#D9DDE5",
      "text": "#121620",
      "textMuted": "#465066",
      "primary": "#1B3A6B",
      "onPrimary": "#FFFFFF",
      "accent": "#D4AF37",
      "onAccent": "#0A1629",
      "danger": "#B42318",
      "onDanger": "#FFFFFF",
      "success": "#067647",
      "onSuccess": "#FFFFFF",
      "warning": "#B54708",
      "onWarning": "#FFFFFF",
      "focus": "#4F75AE"
    },
    "dark": {
      "background": "#0B0E14",
      "surface": "#121620",
      "surfaceMuted": "#1F2533",
      "border": "#323A4D",
      "text": "#F7F8FA",
      "textMuted": "#B8BFCC",
      "primary": "#7F9FCB",
      "onPrimary": "#0A1629",
      "accent": "#D4AF37",
      "onAccent": "#0A1629",
      "danger": "#F97066",
      "onDanger": "#0B0E14",
      "success": "#47CD89",
      "onSuccess": "#0B0E14",
      "warning": "#FDB022",
      "onWarning": "#0B0E14",
      "focus": "#E4CB63"
    }
  },
  "radius": { "sm": "6px", "md": "8px", "lg": "12px", "xl": "16px" }
}
```

`packages/ui/src/tokens/contrast.ts`:
```ts
function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Expected #RRGGBB, got "${hex}"`);
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
```

`packages/ui/src/tokens/index.ts`:
```ts
import tokens from './tokens.json';

export type SemanticColor = keyof typeof tokens.semantic.light;
export { contrastRatio, luminance } from './contrast';
export { tokens };
```

`packages/ui/src/index.ts`:
```ts
export * from './tokens';
```

`packages/ui/tailwind-preset.js`:
```js
const tokens = require('./src/tokens/tokens.json');

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// Each semantic colour becomes `name` (light) and `name-dark`, used as `bg-surface dark:bg-surface-dark`.
const semantic = Object.fromEntries(
  Object.keys(tokens.semantic.light).map((k) => [kebab(k), { DEFAULT: tokens.semantic.light[k], dark: tokens.semantic.dark[k] }]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: { navy: tokens.palette.navy, gold: tokens.palette.gold, ...semantic },
      borderRadius: tokens.radius,
    },
  },
};
```

- [ ] **Step 7: Wire NativeWind into the app**

`apps/app/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), require('@jci/ui/tailwind-preset')],
};
```

`apps/app/global.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/app/babel.config.js`:
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
```

`apps/app/metro.config.js`:
```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
```

`apps/app/nativewind-env.d.ts`:
```ts
/// <reference types="nativewind/types" />
```

Update root `package.json` `scripts` to:
```json
{
  "test": "npm run test:node && npm run test:ui",
  "test:node": "vitest run",
  "test:ui": "npm test -w @jci/ui",
  "typecheck": "tsc -p packages/core --noEmit && tsc -p packages/ui --noEmit",
  "check": "npm run typecheck && npm test"
}
```

- [ ] **Step 8: Run tests and verify the preset loads**

Run: `npm run check`
Expected: typecheck is clean, the 45 Vitest tests pass, and Jest reports every contrast test passing (26 tests).

If a contrast pair fails, adjust **only that token value** in `tokens.json`, keeping it in the same hue family, then re-run.

Run: `node -e "const c=require('./apps/app/tailwind.config.js'); console.log(Object.keys(c.presets[1].theme.extend.colors).join(','))"`
Expected output includes `navy,gold,background,surface,surface-muted,border,text,text-muted,primary,on-primary`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json apps/app packages/ui
git commit -m "feat(ui): scaffold Expo app and @jci/ui design tokens with AA contrast tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: @jci/ui primitives + theme hook, and the app boots on web

**Files:**
- Create: `packages/ui/src/lib/cn.ts`, `packages/ui/src/theme/useTheme.ts`
- Create: `packages/ui/src/primitives/Box.tsx`, `Stack.tsx`, `Text.tsx`, `Heading.tsx`, `Screen.tsx`
- Modify: `packages/ui/src/index.ts`
- Create: `apps/app/app/_layout.tsx`, `apps/app/app/index.tsx`
- Test: `packages/ui/src/primitives/__tests__/primitives.test.tsx`
- Modify: root `package.json` (add `build:web`)

**Interfaces:**
- Consumes: the Tailwind classes from Task 7.
- Produces (all exported from `@jci/ui`):
  - `cn(...inputs: ClassValue[]): string`. Internal to the package; not exported.
  - `useTheme(): { scheme: 'light' | 'dark'; setScheme(s: 'light' | 'dark' | 'system'): void; toggle(): void }`
  - `Box`: `{ children?, padding?: 'none'|'sm'|'md'|'lg', surface?: 'none'|'surface'|'muted', rounded?, bordered?, fill?, testID? }`
  - `Stack`: `{ children?, direction?: 'column'|'row', gap?: 'none'|'xs'|'sm'|'md'|'lg'|'xl', align?: 'start'|'center'|'end'|'stretch', justify?: 'start'|'center'|'end'|'between', wrap?, fill?, testID? }`
  - `Text`: `{ children, variant?: 'body'|'caption'|'label', tone?: 'default'|'muted'|'primary'|'danger'|'success'|'warning', numberOfLines?, accessibilityLabel?, accessibilityLiveRegion?: 'none'|'polite'|'assertive', testID? }`
  - `Heading`: `{ children, level?: 1|2|3, testID? }`
  - `Screen`: `{ children, scroll?: boolean, testID? }`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/primitives/__tests__/primitives.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import { Box } from '../Box';
import { Heading } from '../Heading';
import { Screen } from '../Screen';
import { Stack } from '../Stack';
import { Text } from '../Text';

describe('primitives', () => {
  it('Text maps variant and tone to token classes', () => {
    render(<Text tone="muted" variant="caption">Hello</Text>);
    const cls: string = screen.getByText('Hello').props.className;
    expect(cls).toContain('text-sm');
    expect(cls).toContain('text-text-muted');
    expect(cls).toContain('dark:text-text-muted-dark');
  });

  it('Heading exposes the header role', () => {
    render(<Heading level={2}>Members</Heading>);
    expect(screen.getByRole('header', { name: 'Members' })).toBeTruthy();
    expect(screen.getByText('Members').props.className).toContain('text-2xl');
  });

  it('Stack maps direction and gap', () => {
    render(
      <Stack testID="s" direction="row" gap="lg" justify="between">
        <Text>a</Text>
      </Stack>,
    );
    const cls: string = screen.getByTestId('s').props.className;
    expect(cls).toContain('flex-row');
    expect(cls).toContain('gap-6');
    expect(cls).toContain('justify-between');
  });

  it('Box maps surface, padding and border', () => {
    render(<Box testID="b" surface="muted" padding="md" bordered rounded />);
    const cls: string = screen.getByTestId('b').props.className;
    expect(cls).toContain('bg-surface-muted');
    expect(cls).toContain('p-4');
    expect(cls).toContain('border-border');
    expect(cls).toContain('rounded-xl');
  });

  it('Screen renders children on the background token', () => {
    render(
      <Screen testID="screen">
        <Text>Inside</Text>
      </Screen>,
    );
    expect(screen.getByText('Inside')).toBeTruthy();
    expect(screen.getByTestId('screen').props.className).toContain('bg-background');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @jci/ui -- primitives`
Expected: FAIL with `Cannot find module '../Box'`.

- [ ] **Step 3: Implement the primitives**

`packages/ui/src/lib/cn.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

`packages/ui/src/theme/useTheme.ts`:
```ts
import { useColorScheme } from 'nativewind';

export function useTheme() {
  const { colorScheme, setColorScheme, toggleColorScheme } = useColorScheme();
  return {
    scheme: (colorScheme ?? 'light') as 'light' | 'dark',
    setScheme: setColorScheme as (scheme: 'light' | 'dark' | 'system') => void,
    toggle: toggleColorScheme,
  };
}
```

`packages/ui/src/primitives/Box.tsx`:
```tsx
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../lib/cn';

const PADDING = { none: '', sm: 'p-2', md: 'p-4', lg: 'p-6' } as const;
const SURFACE = {
  none: '',
  surface: 'bg-surface dark:bg-surface-dark',
  muted: 'bg-surface-muted dark:bg-surface-muted-dark',
} as const;

export interface BoxProps {
  children?: ReactNode;
  padding?: keyof typeof PADDING;
  surface?: keyof typeof SURFACE;
  rounded?: boolean;
  bordered?: boolean;
  fill?: boolean;
  testID?: string;
}

export function Box({ children, padding = 'none', surface = 'none', rounded = false, bordered = false, fill = false, testID }: BoxProps) {
  return (
    <View
      testID={testID}
      className={cn(
        PADDING[padding],
        SURFACE[surface],
        rounded && 'rounded-xl',
        bordered && 'border border-border dark:border-border-dark',
        fill && 'flex-1',
      )}
    >
      {children}
    </View>
  );
}
```

`packages/ui/src/primitives/Stack.tsx`:
```tsx
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../lib/cn';

const GAP = { none: 'gap-0', xs: 'gap-1', sm: 'gap-2', md: 'gap-4', lg: 'gap-6', xl: 'gap-8' } as const;
const ALIGN = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' } as const;
const JUSTIFY = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between' } as const;

export interface StackProps {
  children?: ReactNode;
  direction?: 'column' | 'row';
  gap?: keyof typeof GAP;
  align?: keyof typeof ALIGN;
  justify?: keyof typeof JUSTIFY;
  wrap?: boolean;
  fill?: boolean;
  testID?: string;
}

export function Stack({
  children,
  direction = 'column',
  gap = 'md',
  align = 'stretch',
  justify = 'start',
  wrap = false,
  fill = false,
  testID,
}: StackProps) {
  return (
    <View
      testID={testID}
      className={cn(
        direction === 'row' ? 'flex-row' : 'flex-col',
        GAP[gap],
        ALIGN[align],
        JUSTIFY[justify],
        wrap && 'flex-wrap',
        fill && 'flex-1',
      )}
    >
      {children}
    </View>
  );
}
```

`packages/ui/src/primitives/Text.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Text as RNText } from 'react-native';
import { cn } from '../lib/cn';

const VARIANT = { body: 'text-base', caption: 'text-sm', label: 'text-sm font-medium' } as const;
const TONE = {
  default: 'text-text dark:text-text-dark',
  muted: 'text-text-muted dark:text-text-muted-dark',
  primary: 'text-primary dark:text-primary-dark',
  danger: 'text-danger dark:text-danger-dark',
  success: 'text-success dark:text-success-dark',
  warning: 'text-warning dark:text-warning-dark',
} as const;

export interface TextProps {
  children: ReactNode;
  variant?: keyof typeof VARIANT;
  tone?: keyof typeof TONE;
  numberOfLines?: number;
  accessibilityLabel?: string;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  testID?: string;
}

export function Text({ children, variant = 'body', tone = 'default', ...rest }: TextProps) {
  return (
    <RNText className={cn(VARIANT[variant], TONE[tone])} {...rest}>
      {children}
    </RNText>
  );
}
```

`packages/ui/src/primitives/Heading.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Text as RNText } from 'react-native';
import { cn } from '../lib/cn';

const LEVEL = { 1: 'text-3xl font-bold', 2: 'text-2xl font-semibold', 3: 'text-xl font-semibold' } as const;

export interface HeadingProps {
  children: ReactNode;
  level?: 1 | 2 | 3;
  testID?: string;
}

export function Heading({ children, level = 1, testID }: HeadingProps) {
  return (
    <RNText accessibilityRole="header" testID={testID} className={cn(LEVEL[level], 'text-text dark:text-text-dark')}>
      {children}
    </RNText>
  );
}
```

`packages/ui/src/primitives/Screen.tsx`:
```tsx
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface ScreenProps {
  children: ReactNode;
  /** Default true. Set false for screens that manage their own scrolling (lists). */
  scroll?: boolean;
  testID?: string;
}

/** Full-screen page container: safe area, background token, 16px side gutter. */
export function Screen({ children, scroll = true, testID }: ScreenProps) {
  return (
    <SafeAreaView testID={testID} className="flex-1 bg-background dark:bg-background-dark">
      {scroll ? (
        <ScrollView contentContainerClassName="gap-4 px-4 py-6">{children}</ScrollView>
      ) : (
        <View className="flex-1 gap-4 px-4 py-6">{children}</View>
      )}
    </SafeAreaView>
  );
}
```

Replace `packages/ui/src/index.ts` with:
```ts
export * from './tokens';
export { useTheme } from './theme/useTheme';
export { Box, type BoxProps } from './primitives/Box';
export { Stack, type StackProps } from './primitives/Stack';
export { Text, type TextProps } from './primitives/Text';
export { Heading, type HeadingProps } from './primitives/Heading';
export { Screen, type ScreenProps } from './primitives/Screen';
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @jci/ui`
Expected: PASS (contrast tests + 5 primitive tests).

- [ ] **Step 5: Add the minimal app routes**

`apps/app/app/_layout.tsx`:
```tsx
import '../global.css';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`apps/app/app/index.tsx`:
```tsx
import { Heading, Screen, Stack, Text } from '@jci/ui';

export default function Home() {
  return (
    <Screen>
      <Stack gap="sm">
        <Heading level={1}>JCI Platform</Heading>
        <Text tone="muted">Phase 1 — foundation</Text>
      </Stack>
    </Screen>
  );
}
```

In root `package.json` scripts:
- set `"typecheck"` to `"tsc -p packages/core --noEmit && tsc -p packages/ui --noEmit && tsc -p apps/app --noEmit"`
- add `"build:web": "npm run export:web -w @jci/app"`

- [ ] **Step 6: Verify the app builds and renders on web**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build:web`
Expected: `Exported: dist` (or equivalent) with exit code 0, and no Metro resolution errors for `@jci/ui`.

Run `npx expo start --web --port 8081` from `apps/app` as a background process, then open `http://localhost:8081`.
Expected:
- a navy-on-light page showing "JCI Platform" in large bold text with muted grey subtitle text
- Tailwind classes are applied: the text is not unstyled Times, and the background is the off-white `background` token

Stop the dev server afterwards.

- [ ] **Step 7: Commit**

```bash
git add package.json packages/ui apps/app
git commit -m "feat(ui): primitives, theme hook and bootable app shell

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: @jci/ui base components

**Files:**
- Create: `packages/ui/src/components/Button.tsx`, `Input.tsx`, `Card.tsx`, `Badge.tsx`, `EmptyState.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/src/components/__tests__/components.test.tsx`

**Interfaces:**
- Consumes: `cn`, `Box`, `Stack`, `Text`, `Heading` (Task 8).
- Produces (exported from `@jci/ui`):
  - `Button`: `{ label: string; onPress(): void; variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'sm'|'md'|'lg'; disabled?; loading?; fullWidth?; accessibilityHint?; testID? }`
  - `Input`: `{ label: string; value: string; onChangeText(t: string): void; placeholder?; error?; hint?; secureTextEntry?; keyboardType?: 'default'|'email-address'|'numeric'|'phone-pad'; autoCapitalize?: 'none'|'sentences'|'words'|'characters'; editable?; testID? }`
  - `Card`: `{ title?: string; children; testID? }`
  - `Badge`: `{ label: string; tone?: 'neutral'|'primary'|'accent'|'success'|'warning'|'danger'; testID? }`
  - `EmptyState`: `{ title: string; description?: string; actionLabel?: string; onAction?(): void; testID? }`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/components/__tests__/components.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Card } from '../Card';
import { EmptyState } from '../EmptyState';
import { Input } from '../Input';
import { Text } from '../../primitives/Text';

describe('Button', () => {
  it('is an accessible button that fires onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the 44px touch target in every size', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { unmount } = render(<Button label={`B-${size}`} size={size} onPress={() => {}} />);
      expect(screen.getByRole('button', { name: `B-${size}` }).props.className).toMatch(/min-h-1[12]/);
      unmount();
    }
  });

  it('does not fire when disabled and reports the state', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} disabled />);
    const btn = screen.getByRole('button', { name: 'Save' });
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('is busy and inactive while loading', () => {
    const onPress = jest.fn();
    render(<Button label="Pay" onPress={onPress} loading />);
    const btn = screen.getByRole('button', { name: 'Pay' });
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('maps variants to token classes', () => {
    render(<Button label="Delete" variant="danger" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Delete' }).props.className).toContain('bg-danger');
  });
});

describe('Input', () => {
  it('is labelled, forwards text and shows errors politely', () => {
    const onChangeText = jest.fn();
    render(<Input label="Email" value="" onChangeText={onChangeText} error="Required" />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.co');
    expect(onChangeText).toHaveBeenCalledWith('a@b.co');
    const err = screen.getByText('Required');
    expect(err.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByLabelText('Email').props.className).toContain('border-danger');
  });

  it('shows the hint when there is no error', () => {
    render(<Input label="Phone" value="" onChangeText={() => {}} hint="Include country code" />);
    expect(screen.getByText('Include country code')).toBeTruthy();
  });
});

describe('Card, Badge, EmptyState', () => {
  it('Card renders an optional title and children', () => {
    render(
      <Card title="Membership">
        <Text>Official</Text>
      </Card>,
    );
    expect(screen.getByRole('header', { name: 'Membership' })).toBeTruthy();
    expect(screen.getByText('Official')).toBeTruthy();
  });

  it('Badge maps tone to token classes', () => {
    render(<Badge label="Paid" tone="success" testID="badge" />);
    expect(screen.getByTestId('badge').props.className).toContain('bg-success');
    expect(screen.getByText('Paid').props.className).toContain('text-on-success');
  });

  it('EmptyState shows the action only when both label and handler are given', () => {
    const onAction = jest.fn();
    const { rerender } = render(<EmptyState title="No members" description="Add the first one" actionLabel="Add member" onAction={onAction} />);
    fireEvent.press(screen.getByRole('button', { name: 'Add member' }));
    expect(onAction).toHaveBeenCalled();
    rerender(<EmptyState title="No members" actionLabel="Add member" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @jci/ui -- components`
Expected: FAIL with `Cannot find module '../Badge'`.

- [ ] **Step 3: Implement the components**

`packages/ui/src/components/Button.tsx`:
```tsx
import { ActivityIndicator, Pressable, Text as RNText } from 'react-native';
import { cn } from '../lib/cn';

const VARIANT = {
  primary: { box: 'bg-primary dark:bg-primary-dark', text: 'text-on-primary dark:text-on-primary-dark' },
  secondary: {
    box: 'border border-border bg-surface-muted dark:border-border-dark dark:bg-surface-muted-dark',
    text: 'text-text dark:text-text-dark',
  },
  ghost: { box: 'bg-transparent', text: 'text-primary dark:text-primary-dark' },
  danger: { box: 'bg-danger dark:bg-danger-dark', text: 'text-on-danger dark:text-on-danger-dark' },
} as const;

const SIZE = {
  sm: { box: 'min-h-11 px-3', text: 'text-sm' },
  md: { box: 'min-h-11 px-4', text: 'text-base' },
  lg: { box: 'min-h-12 px-6', text: 'text-lg' },
} as const;

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const v = VARIANT[variant];
  const s = SIZE[size];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-lg active:opacity-80',
        'web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-focus dark:web:focus-visible:ring-focus-dark',
        v.box,
        s.box,
        fullWidth && 'w-full',
        inactive && 'opacity-50',
      )}
    >
      {loading ? <ActivityIndicator className={v.text} /> : null}
      <RNText className={cn('font-semibold', v.text, s.text)}>{label}</RNText>
    </Pressable>
  );
}
```

`packages/ui/src/components/Input.tsx`:
```tsx
import { TextInput, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';

export interface InputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  testID?: string;
}

export function Input({ label, error, hint, testID, ...inputProps }: InputProps) {
  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderClassName="text-text-muted dark:text-text-muted-dark"
        className={cn(
          'min-h-11 rounded-lg border bg-surface px-3 text-base text-text dark:bg-surface-dark dark:text-text-dark',
          'web:focus:border-focus dark:web:focus:border-focus-dark',
          error ? 'border-danger dark:border-danger-dark' : 'border-border dark:border-border-dark',
        )}
        {...inputProps}
      />
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
```

`packages/ui/src/components/Card.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Box } from '../primitives/Box';
import { Heading } from '../primitives/Heading';
import { Stack } from '../primitives/Stack';

export interface CardProps {
  title?: string;
  children: ReactNode;
  testID?: string;
}

export function Card({ title, children, testID }: CardProps) {
  return (
    <Box testID={testID} surface="surface" padding="md" rounded bordered>
      <Stack gap="sm">
        {title ? <Heading level={3}>{title}</Heading> : null}
        {children}
      </Stack>
    </Box>
  );
}
```

`packages/ui/src/components/Badge.tsx`:
```tsx
import { Text as RNText, View } from 'react-native';
import { cn } from '../lib/cn';

const TONE = {
  neutral: { box: 'bg-surface-muted dark:bg-surface-muted-dark', text: 'text-text dark:text-text-dark' },
  primary: { box: 'bg-primary dark:bg-primary-dark', text: 'text-on-primary dark:text-on-primary-dark' },
  accent: { box: 'bg-accent dark:bg-accent-dark', text: 'text-on-accent dark:text-on-accent-dark' },
  success: { box: 'bg-success dark:bg-success-dark', text: 'text-on-success dark:text-on-success-dark' },
  warning: { box: 'bg-warning dark:bg-warning-dark', text: 'text-on-warning dark:text-on-warning-dark' },
  danger: { box: 'bg-danger dark:bg-danger-dark', text: 'text-on-danger dark:text-on-danger-dark' },
} as const;

export interface BadgeProps {
  label: string;
  tone?: keyof typeof TONE;
  testID?: string;
}

export function Badge({ label, tone = 'neutral', testID }: BadgeProps) {
  const t = TONE[tone];
  return (
    <View testID={testID} className={cn('self-start rounded-md px-2 py-0.5', t.box)}>
      <RNText className={cn('text-xs font-semibold', t.text)}>{label}</RNText>
    </View>
  );
}
```

`packages/ui/src/components/EmptyState.tsx`:
```tsx
import { Box } from '../primitives/Box';
import { Heading } from '../primitives/Heading';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({ title, description, actionLabel, onAction, testID }: EmptyStateProps) {
  return (
    <Box testID={testID} padding="lg">
      <Stack gap="sm" align="center">
        <Heading level={3}>{title}</Heading>
        {description ? <Text tone="muted">{description}</Text> : null}
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
      </Stack>
    </Box>
  );
}
```

Append to `packages/ui/src/index.ts`:
```ts
export { Button, type ButtonProps } from './components/Button';
export { Input, type InputProps } from './components/Input';
export { Card, type CardProps } from './components/Card';
export { Badge, type BadgeProps } from './components/Badge';
export { EmptyState, type EmptyStateProps } from './components/EmptyState';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm run check`
Expected: all Vitest and Jest suites pass, and typecheck is clean.

If `placeholderClassName` or `contentContainerClassName` gives a type error, the NativeWind types are not loaded. Check that `packages/ui/tsconfig.json` includes `nativewind-env.d.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): Button, Input, Card, Badge and EmptyState components

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Lint enforcement — app code may only use @jci/ui

**Files:**
- Create: `eslint.config.mjs`, `tools/eslint-plugin-jci/index.mjs`, `tools/eslint-plugin-jci/rules/no-raw-styling.mjs`, `tools/eslint-plugin-jci/rules/no-hex-colors.mjs`, `tools/eslint-plugin-jci/restricted-imports.mjs`, `packages/ui/README.md`, `.github/workflows/ci.yml`
- Test: `tools/eslint-plugin-jci/rules.test.mjs`, `tools/eslint-plugin-jci/enforcement.test.mjs`
- Modify: root `package.json` (lint script + dev deps)

**Interfaces:**
- Produces:
  - ESLint rules `jci/no-raw-styling` (messageId `raw`) and `jci/no-hex-colors` (messageId `hex`)
  - `npm run lint`
  - the updated `npm run check`: lint, then typecheck, then test

- [ ] **Step 1: Install ESLint**

Run: `npm install -D eslint@^9 @eslint/js@^9 typescript-eslint@^8 globals`
Expected: exits with code 0.

- [ ] **Step 2: Write the failing tests**

`tools/eslint-plugin-jci/rules.test.mjs`:
```js
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import noHexColors from './rules/no-hex-colors.mjs';
import noRawStyling from './rules/no-raw-styling.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

tester.run('no-raw-styling', noRawStyling, {
  valid: [{ code: '<Button label="Save" onPress={save} variant="primary" />' }],
  invalid: [
    { code: '<View className="p-4" />', errors: [{ messageId: 'raw' }] },
    { code: '<View style={{ padding: 4 }} />', errors: [{ messageId: 'raw' }] },
    { code: '<List contentContainerStyle={{ gap: 4 }} />', errors: [{ messageId: 'raw' }] },
  ],
});

tester.run('no-hex-colors', noHexColors, {
  valid: [{ code: "const anchor = '#heading';" }, { code: "const id = 'abc123';" }, { code: "const tag = '#12';" }],
  invalid: [
    { code: "const c = '#1B3A6B';", errors: [{ messageId: 'hex' }] },
    { code: "const c = '#fff';", errors: [{ messageId: 'hex' }] },
    { code: "const c = '#1B3A6BFF';", errors: [{ messageId: 'hex' }] },
    { code: '<Icon color="#000000" />', errors: [{ messageId: 'hex' }] },
  ],
});
```

`tools/eslint-plugin-jci/enforcement.test.mjs`:
```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function ruleIds(relPath, code) {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath: path.join(root, relPath) });
  return result.messages.map((m) => m.ruleId);
}

const APP_FILE = 'apps/app/app/__fixture__.tsx';

describe('UI enforcement in app code', () => {
  it('blocks react-native primitives', async () => {
    const ids = await ruleIds(APP_FILE, "import { View } from 'react-native';\nexport default function F() { return <View />; }\n");
    expect(ids).toContain('no-restricted-imports');
  });

  it('blocks UI libraries and nativewind', async () => {
    expect(await ruleIds(APP_FILE, "import { Home } from 'lucide-react-native';\nexport const x = Home;\n")).toContain('no-restricted-imports');
    expect(await ruleIds(APP_FILE, "import { useColorScheme } from 'nativewind';\nexport const x = useColorScheme;\n")).toContain('no-restricted-imports');
  });

  it('blocks className/style props', async () => {
    const ids = await ruleIds(APP_FILE, "import { Box } from '@jci/ui';\nexport default function F() { return <Box className=\"p-4\" />; }\n");
    expect(ids).toContain('jci/no-raw-styling');
  });

  it('blocks hex colours', async () => {
    expect(await ruleIds(APP_FILE, "export const brand = '#1B3A6B';\n")).toContain('jci/no-hex-colors');
  });

  it('allows composing @jci/ui', async () => {
    const code = "import { Button } from '@jci/ui';\nexport default function F() { return <Button label=\"Go\" onPress={() => {}} />; }\n";
    expect(await ruleIds(APP_FILE, code)).toEqual([]);
  });

  it('allows primitives and className inside packages/ui', async () => {
    const code = "import { View } from 'react-native';\nexport function P() { return <View className=\"p-4\" />; }\n";
    expect(await ruleIds('packages/ui/src/primitives/__fixture__.tsx', code)).toEqual([]);
  });

  it('still blocks hex colours inside packages/ui source', async () => {
    expect(await ruleIds('packages/ui/src/components/__fixture__.tsx', "export const c = '#FFFFFF';\n")).toContain('jci/no-hex-colors');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tools`
Expected: FAIL with `Failed to resolve import "./rules/no-hex-colors.mjs"`.

- [ ] **Step 4: Implement the plugin and config**

`tools/eslint-plugin-jci/rules/no-raw-styling.mjs`:
```js
const BANNED = new Set(['className', 'style', 'contentContainerStyle', 'contentContainerClassName']);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow raw styling props outside @jci/ui' },
    messages: {
      raw: 'Do not pass "{{name}}" in app code. Use @jci/ui component props (variant, size, tone) or add a component to packages/ui.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type === 'JSXIdentifier' && BANNED.has(node.name.name)) {
          context.report({ node, messageId: 'raw', data: { name: node.name.name } });
        }
      },
    };
  },
};
```

`tools/eslint-plugin-jci/rules/no-hex-colors.mjs`:
```js
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow hex colour literals; colours live in packages/ui/src/tokens/tokens.json' },
    messages: { hex: 'Hex colour "{{value}}" is not allowed. Use a semantic token via @jci/ui.' },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string' && HEX.test(node.value)) {
          context.report({ node, messageId: 'hex', data: { value: node.value } });
        }
      },
    };
  },
};
```

`tools/eslint-plugin-jci/index.mjs`:
```js
import noHexColors from './rules/no-hex-colors.mjs';
import noRawStyling from './rules/no-raw-styling.mjs';

export default {
  meta: { name: 'eslint-plugin-jci' },
  rules: { 'no-raw-styling': noRawStyling, 'no-hex-colors': noHexColors },
};
```

`tools/eslint-plugin-jci/restricted-imports.mjs`:
```js
export const RESTRICTED_UI_IMPORTS = {
  paths: [
    {
      name: 'react-native',
      importNames: [
        'View',
        'Text',
        'Pressable',
        'TextInput',
        'Image',
        'ImageBackground',
        'ScrollView',
        'FlatList',
        'SectionList',
        'Modal',
        'TouchableOpacity',
        'TouchableHighlight',
        'TouchableWithoutFeedback',
        'StyleSheet',
        'ActivityIndicator',
        'Switch',
        'SafeAreaView',
      ],
      message: 'Use components from @jci/ui instead of react-native primitives.',
    },
    { name: 'nativewind', message: 'Styling lives in @jci/ui. Use useTheme() from @jci/ui.' },
    { name: 'react-native-safe-area-context', message: 'Use Screen or layouts from @jci/ui.' },
  ],
  patterns: [
    {
      group: [
        '@tanstack/*',
        'lucide-react-native',
        '@expo/vector-icons',
        '@expo/vector-icons/*',
        'react-native-reanimated',
        'react-native-svg',
        'clsx',
        'tailwind-merge',
        'class-variance-authority',
        '@rn-primitives/*',
      ],
      message: 'UI libraries may only be used inside packages/ui. Import from @jci/ui.',
    },
  ],
};
```

`eslint.config.mjs`:
```js
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import jci from './tools/eslint-plugin-jci/index.mjs';
import { RESTRICTED_UI_IMPORTS } from './tools/eslint-plugin-jci/restricted-imports.mjs';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/.expo/**',
      '**/dist/**',
      '**/web-build/**',
      '**/*.d.ts',
      '**/*.config.js',
      'packages/ui/tailwind-preset.js',
      'packages/ui/jest.setup.js',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['tools/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
  // App code: UI only via @jci/ui.
  {
    files: ['apps/app/**/*.{ts,tsx}', 'packages/doctypes/**/*.{ts,tsx}'],
    plugins: { jci },
    rules: {
      'no-restricted-imports': ['error', RESTRICTED_UI_IMPORTS],
      'jci/no-raw-styling': 'error',
      'jci/no-hex-colors': 'error',
    },
  },
  // The library itself may use primitives and className, but colours still come only from tokens.json.
  {
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    plugins: { jci },
    rules: { 'jci/no-hex-colors': 'error' },
  },
);
```

`packages/ui/README.md`:
````markdown
# @jci/ui — the only UI/UX library for the JCI platform

**Rule:** every screen in `apps/app` (and any UI in `packages/doctypes`) is built only from `@jci/ui` exports. `npm run lint` fails on any of these:
- importing React Native view primitives, NativeWind, icon or animation libraries, TanStack, clsx or tailwind-merge outside this package
- passing `className`, `style` or `contentContainerStyle`
- writing a hex colour literal anywhere except `src/tokens/tokens.json`

## Adding or changing UI
1. Need something that doesn't exist? Build it here first: `src/primitives/` for layout and typography, `src/components/` for everything else.
2. Give it semantic props (`variant`, `size`, `tone`). Never accept `className` or `style`.
3. Tailwind classes must be literal strings in lookup maps (`const TONE = { muted: 'text-text-muted dark:text-text-muted-dark' }`). Never build class names at runtime.
4. Every colour is a semantic token used as a pair: `bg-surface dark:bg-surface-dark`. New colours go in `tokens.json`, and `contrast.test.ts` must still pass (WCAG AA).
5. Accessibility is built in: `accessibilityRole` and `accessibilityLabel`, `min-h-11` (44 px) touch targets, and web focus rings.
6. Add tests in `__tests__/`, export the component from `src/index.ts`, and add it to the gallery (`apps/app/app/(dev)/ui-gallery.tsx`) with every variant.

## Scripts
- `npm test -w @jci/ui` runs Jest (jest-expo + React Native Testing Library).
- The gallery runs at `/ui-gallery` in dev builds.
````

`.github/workflows/ci.yml`:
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
      - run: npm ci
      - run: npm run check
      - run: npm run build:web
```

In root `package.json` scripts, add `"lint": "eslint ."` and change `"check"` to `"npm run lint && npm run typecheck && npm test"`.

- [ ] **Step 5: Run the tests and lint the whole repo**

Run: `npx vitest run tools`
Expected: PASS. Both RuleTester suites and the 7 enforcement tests pass.

Run: `npm run check`
Expected: ESLint reports 0 problems on the real code, typecheck is clean, and all tests pass.

If ESLint flags existing files, fix the code, never the rule. For example, a leftover template file in `apps/app` that imports `react-native` primitives should be deleted.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs tools packages/ui/README.md .github package.json package-lock.json
git commit -m "feat(lint): enforce @jci/ui as the only UI source for app code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: UI gallery route + home link, verified in both themes

**Files:**
- Create: `apps/app/app/(dev)/ui-gallery.tsx`
- Modify: `apps/app/app/index.tsx`

**Interfaces:**
- Consumes: all `@jci/ui` exports from Tasks 8–9, and `useRouter` / `Redirect` from `expo-router`.
- Produces: the `/ui-gallery` route (dev builds only). This is the reference catalogue that every later milestone extends.

- [ ] **Step 1: Write the gallery**

`apps/app/app/(dev)/ui-gallery.tsx`:
```tsx
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Badge, Button, Card, EmptyState, Heading, Input, Screen, Stack, Text, useTheme } from '@jci/ui';

export default function UiGallery() {
  const { scheme, toggle } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen>
      <Stack direction="row" justify="between" align="center">
        <Heading level={1}>UI gallery</Heading>
        <Button label={scheme === 'dark' ? 'Light theme' : 'Dark theme'} variant="secondary" size="sm" onPress={toggle} />
      </Stack>

      <Card title="Typography">
        <Heading level={1}>Heading 1</Heading>
        <Heading level={2}>Heading 2</Heading>
        <Heading level={3}>Heading 3</Heading>
        <Text>Body text — default tone</Text>
        <Text tone="muted">Muted text</Text>
        <Text tone="primary">Primary text</Text>
        <Text tone="danger">Danger text</Text>
        <Text tone="success">Success text</Text>
        <Text tone="warning">Warning text</Text>
        <Text variant="caption">Caption</Text>
        <Text variant="label">Label</Text>
      </Card>

      <Card title="Buttons">
        <Stack direction="row" gap="sm" wrap>
          <Button label="Primary" onPress={() => {}} />
          <Button label="Secondary" variant="secondary" onPress={() => {}} />
          <Button label="Ghost" variant="ghost" onPress={() => {}} />
          <Button label="Danger" variant="danger" onPress={() => {}} />
        </Stack>
        <Stack direction="row" gap="sm" wrap align="center">
          <Button label="Small" size="sm" onPress={() => {}} />
          <Button label="Medium" size="md" onPress={() => {}} />
          <Button label="Large" size="lg" onPress={() => {}} />
        </Stack>
        <Stack direction="row" gap="sm" wrap>
          <Button label="Disabled" disabled onPress={() => {}} />
          <Button
            label={loading ? 'Saving' : 'Tap to load'}
            loading={loading}
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          />
        </Stack>
        <Button label="Full width" fullWidth onPress={() => {}} />
      </Card>

      <Card title="Inputs">
        <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@jcikl.cc" keyboardType="email-address" autoCapitalize="none" />
        <Input label="Phone" value="" onChangeText={() => {}} hint="Include country code, e.g. +60" />
        <Input label="Full name" value="" onChangeText={() => {}} error="Full name is required" />
        <Input label="Membership no." value="MEM-2026-00001" onChangeText={() => {}} editable={false} />
      </Card>

      <Card title="Badges">
        <Stack direction="row" gap="sm" wrap>
          <Badge label="Neutral" />
          <Badge label="Primary" tone="primary" />
          <Badge label="Accent" tone="accent" />
          <Badge label="Paid" tone="success" />
          <Badge label="Due soon" tone="warning" />
          <Badge label="Overdue" tone="danger" />
        </Stack>
      </Card>

      <Card title="Empty state">
        <EmptyState title="No members yet" description="Members you add will appear here." actionLabel="Add member" onAction={() => {}} />
      </Card>
    </Screen>
  );
}
```

- [ ] **Step 2: Link it from home**

Replace `apps/app/app/index.tsx` with:
```tsx
import { useRouter } from 'expo-router';
import { Button, Heading, Screen, Stack, Text } from '@jci/ui';

export default function Home() {
  const router = useRouter();
  return (
    <Screen>
      <Stack gap="sm">
        <Heading level={1}>JCI Platform</Heading>
        <Text tone="muted">Phase 1 — foundation</Text>
      </Stack>
      {__DEV__ ? <Button label="Open UI gallery" variant="secondary" onPress={() => router.push('/ui-gallery')} /> : null}
    </Screen>
  );
}
```

- [ ] **Step 3: Run the full check and web build**

Run: `npm run check`
Expected: lint reports 0 problems, which confirms the gallery follows the rule. Typecheck is clean and all tests pass.

Run: `npm run build:web`
Expected: exit code 0.

- [ ] **Step 4: Verify visually in both themes**

Run `npx expo start --web --port 8081` from `apps/app` in the background. Open `http://localhost:8081`, press "Open UI gallery", then check:
- **Light theme:**
  - Navy primary buttons with white labels.
  - Gold accent badge with dark text.
  - The error input has a red border and a red message.
  - The disabled button is faded.
  - The loading button shows a spinner and "Saving" for about 1.5 s.
- **Press "Dark theme":**
  - The background turns near-black.
  - Cards are dark surfaces with visible borders.
  - All text stays readable, and the primary button becomes light navy with dark text.
- **At a phone-sized viewport (375 px wide):**
  - No horizontal scrolling.
  - A 16 px side gutter.
  - Button rows wrap.

Take one screenshot per theme and save them as `docs/superpowers/plans/m1-gallery-light.png` and `m1-gallery-dark.png`. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add apps/app docs/superpowers/plans/m1-gallery-*.png
git commit -m "feat(app): dev UI gallery showing every @jci/ui component in both themes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## M1 exit criteria
- `npm run check` is green: lint, then typecheck, then 45 Vitest core tests, 18 ESLint tests (11 RuleTester cases + 7 enforcement) and the Jest UI suites (26 contrast + 5 primitive + 10 component).
- `npm run build:web` succeeds.
- `/ui-gallery` renders every component correctly in light and dark themes.
- `@jci/core` exports the full engine API: `defineDocType`, `createRegistry`, `mergeCustomFields`, `fieldKey`, `buildSchema`, `can`, `unwritableKeys`, `readableFields`, `diffDocs`, `formatSeriesName`, `seriesPrefix` and the org helpers. M2 builds the Netlify `/api/resource` pipeline on top of this.

## Next plans (written after M1 lands, against the real code)
- **M2:** Firebase project + emulators, `netlify/functions/_shared`, the `/api/resource` save pipeline (permissions → schema → hooks → transaction with version + naming counter), `userAccess`, Firestore rules and rules tests.
- **M3:** `@jci/ui` `fields/` (a FieldControl per field type) and `desk/` (DocList, DocForm, FilterBar, Timeline, LinkPicker), plus the DeskShell, PortalShell and AuthShell layouts, plus `/desk/[doctype]` routes.
- **M4:** `packages/doctypes` (Organization + seed data, roles, Person, Membership, MembershipDues, Senatorship, MembershipTypeRule, PositionType, BoardTerm, PositionHolding) and the controllers ported from Eric.
- **M5:** the member Portal.
- **M6:** dues generation + ToyyibPay.
- **M7:** Eric migration + cutover.
