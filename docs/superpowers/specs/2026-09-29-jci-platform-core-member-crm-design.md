# JCI Platform — Phase 1: Frappe-style core + Member CRM

## Context
The goal is one integrated system for JCI covering organisation, member CRM, finance, events and online learning. It is modelled on Frappe's metadata-driven approach (DocType → automatic forms, lists, API, permissions and change history). It will **replace** the existing JCI KL (Eric) admin system (`BMAD Project\JCI KL (Eric`, Vite + React + Firebase) and absorb its business rules and data.

Eric already works, but it has structural problems:
- The `members` doc is one monolith: `jciCareer` embeds the dues history and board history.
- `membersService.ts` has grown to 2283 lines.
- Ordinary edits leave no change history.
- The permission rules in `permissionCatalog` are stored but never evaluated; access checks use the hard-coded `ROLE_PERMISSIONS`.
- There is no organisation hierarchy.

Decisions confirmed with the user:
- **Keep the familiar stack**: TypeScript + Firebase, reimplementing Frappe's ideas rather than using Frappe itself.
- **One Expo app** (Web + iOS + Android) that shows different interfaces by role.
- **A new Firebase project**, with migration scripts importing the old data.
- **DocTypes defined in code** with Zod, plus custom fields that admins add from the back office.
- **Server logic in Netlify Functions.**
- **The organisation model supports the full hierarchy** (HQ > Area > National > National Area > Local). The first launch covers only JCI KL.
- **Membership belongs to a Local; board positions can be held at any level** and are recorded per term.
- **Phase 1 builds the core engine plus the Member CRM.** Events, finance and LMS follow later, one module at a time.
- **One UI/UX component library (`packages/ui`) governs the whole system.** All app UI must be built from its components; using raw primitives or third-party UI libraries directly in app code is not allowed, and lint enforces this (see "UI component library").

## Architecture

**Repo:** `C:\Users\User\Documents\Cursor projects\Frappe`. It gets its own `git init`, because the parent home directory is itself a git repo. It uses npm workspaces:
```
apps/app/                 Expo Router (web + native); screens only, all UI imported from @jci/ui
  app/(auth)/             login (email + Google)
  app/(portal)/           member-facing: home, profile, my membership & dues, directory, board
  app/(desk)/             admin "Desk": /desk/[doctype] list, /desk/[doctype]/[id] form
  app/(dev)/ui-gallery    component catalogue (dev builds only)
packages/ui/              @jci/ui — the single UI/UX component library
  tokens/                 colours, typography, spacing, radius, shadow, motion; light + dark
  primitives/             Box, Stack, Text, Heading, Icon, Pressable, Image, Divider
  components/             Button, Input, Select, Checkbox, DatePicker, Avatar, Badge, Card, Modal, Sheet, Toast, Tabs, EmptyState, Skeleton…
  fields/                 one FieldControl per DocType field type (Data, Currency, Link, Table…)
  desk/                   DocList, DocForm, FilterBar, Timeline, LinkPicker; *.web.tsx uses DOM + TanStack Table, native uses a simplified RN version
  layouts/                DeskShell (sidebar), PortalShell (bottom tabs), AuthShell
packages/core/            pure TS, shared by the app and the functions
  meta/                   DocType/Field types, field types, naming series, defineDocType()
  validate/               builds Zod schemas from meta (+ custom fields)
  perm/                   DocPerm + permlevel + org-scope evaluator
  diff/                   version diff
packages/doctypes/        DocType definitions + controllers, grouped by module (core/, membership/)
netlify/functions/
  _shared/                admin init, verifyIdToken, CORS allowlist, error mapping (fixes Eric's per-function copies)
  resource.mts            Frappe-style REST: /api/resource/:doctype[/:id]  (POST/PUT/DELETE)
  method.mts              /api/method/:name  — whitelisted controller actions (e.g. generateDues)
  toyyibpay-*.mts         ported from Eric
  scheduled-*.mts         dues renewal on 1 Oct, reminders on 1 Jan
firestore.rules           reads are scoped by org; client writes to DocType collections are denied
scripts/migrate-eric/     idempotent migration from the old project (dry-run + reconcile report)
docs/superpowers/specs/   design spec (written and committed first, per brainstorming)
```

**Data flow (the key point):**
- **Reads** go directly from the client to Firestore, protected by rules.
- **All writes** go through `resource.mts`, which runs these steps in order:
  1. Verify the ID token.
  2. Load the DocType meta and the org's custom fields.
  3. `perm.can(user, doctype, action, doc)`, checking both role and org scope.
  4. Strip fields above the user's permlevel.
  5. Zod validation.
  6. Controller hooks: `validate`, `beforeSave`.
  7. In one Firestore transaction, write the doc and a `versions/{id}` entry with the field diff.
  8. `afterSave`.

  This gives Frappe's guarantees (validation, permissions and a full audit trail) without needing Firestore triggers.
- **Access for rules:** the server maintains `userAccess/{uid}`, containing `{personId, roles:[{role, orgId, withDescendants}], orgPaths}`. Firestore rules read that doc.
- **Org roll-up:** every doc carries `orgId` and `orgPath: string[]` (its ancestors), so a parent level queries its subtree with `orgPath array-contains X`.

## UI component library (packages/ui)

**The rule:** every screen in `apps/app` builds its UI only from `@jci/ui`. The following may be imported **only inside `packages/ui`**:
- `react-native` view primitives: View, Text, Pressable, TextInput, Image, ScrollView, FlatList, Modal
- NativeWind `className` styling
- `@tanstack/react-table`, icon packs, animation libraries

**Enforcement:**
- **ESLint** in `apps/app` and `packages/doctypes`:
  - `no-restricted-imports` blocks those modules.
  - A custom rule bans the `className`/`style` props on elements.
  - CI fails on any violation.
- **Tokens only:** colours, spacing and fonts come from `tokens/`. Components take semantic props (`variant`, `size`, `tone`) rather than free styling, and no hex values appear outside `tokens/`.
- **A missing component gets built in `packages/ui` first**, with a gallery entry, and only then used in a screen. No one-off UI in app code.

**Foundation:**
- NativeWind (Tailwind) styling, with the tokens feeding `tailwind.config`.
- Base components come from react-native-reusables (the shadcn-style copy-in library for React Native). They are copied into `packages/ui` and owned by this repo, so there is no runtime dependency to drift.
- Brand: navy `#1B3A6B` and gold `#D4AF37`, with light and dark themes.

**How DocTypes use it:**
- The Desk renderer maps each field type to `fields/FieldControl`, so a new DocType automatically gets consistent forms and lists.
- The same components render on Web, iOS and Android. Where a platform needs something different, a `.web.tsx` file handles it inside `packages/ui`, never in the app.

**Accessibility and quality, built into the components:**
- Accessibility labels and roles.
- Minimum 44 px touch targets.
- WCAG AA contrast, checked against the tokens.
- Focus states on web.
- Loading, empty and error states (`Skeleton`, `EmptyState`, `ErrorState`).

**Catalogue:** the `/ui-gallery` route (dev builds only) shows every component with all its variants in light and dark themes. It is the reference for developers.

## Core engine (packages/core)

**DocType meta fields:**
- `name`, `module`, `collection`, `naming` (e.g. `MEM-.YYYY.-.#####` or `autoId`)
- `fields[]`, `permissions[]`, `titleField`, `searchFields`, `listFields`, `isChild`, `trackChanges`

**Field types:**
- Data, Text, Int, Float, Currency, Date, Datetime, Check, Select, Link (to another DocType), Table (child rows stored as an array), AttachImage, JSON

**Field properties:**
- `reqd`, `unique`, `readOnly`, `hidden`, `permlevel`, `dependsOn`, `options`, `section/tab`

**Permissions:**
- Roles: SystemManager, OrgAdmin, MembershipOfficer, Treasurer, BoardMember, Member, Guest.
- A `RoleAssignment` is scoped to an org and optionally its descendants.
- A `PositionRoleMap` automatically grants roles from the board positions a person holds, e.g. Local President → OrgAdmin@local, Treasurer → Treasurer@local. This ports Eric's rule in `utils/boardMembership.ts` and `hooks/usePermissions.ts` that finance access goes to Treasurer, Secretary and President.
- Permlevel 1 locks fields such as membership type, role and senatorship. This replaces the locked-field list at `firestore.rules:127+`.
- The same evaluator gates the UI on the client and enforces access on the server.

**Other building blocks:**
- **Naming series:** server-side counters in `series/{prefix}`, updated in a transaction.
- **Custom fields:** the `CustomField` DocType holds `{doctype, orgId, fieldname, fieldtype, label, options, permlevel}`. Custom fields are merged into the meta at runtime and stored under `doc.custom`.
- **Versions:** each entry holds `{doctype, docId, changed:[[field, old, new]], by, at}`. A timeline tab on every form renders them.

## Phase 1 DocTypes (packages/doctypes)

**Core**
- **Organization:**
  - Fields: `level` (hq/area/national/national_area/local), `parent`, `orgPath`, `currency`, `timezone`.
  - Seed data: JCI → Asia Pacific → JCI Malaysia → its area → JCI Kuala Lumpur.
- **Role**, **RoleAssignment**, **CustomField**, **Version**.

**Membership**
- **Person:**
  - Holds the `general`, `contact`, `business`, `others` and `privacy` sections from Eric's `types/member.ts:175-321`.
  - Links to Firebase Auth through `authUid`.
- **Membership:**
  - Fields: `person`, `org` (must be a local), `type`, `status`, `joinDate`, `introducer`, `probationProgress`, `mentor`.
  - One active membership per person.
- **MembershipDues:**
  - Fields: `membership`, `year`, `amount`, breakdown (annual / registration / entry), `status`, ToyyibPay refs.
  - Replaces `membershipDuesHistory`.
- **Senatorship:** `person`, `senatorNumber`, `validated`, `validatedBy/At`.
- **MembershipTypeRule:**
  - Set per org and inherited down the tree; a National default can be overridden by a Local.
  - Values are ported from `DEFAULT_MEMBERSHIP_RULES` (dues, age, nationality, senatorship, the RM50 first-year fee, the RM350 guest entry fee).
- **PositionType:**
  - A master list per org level.
  - Seeded from `POSITION_ORDER` in `BoardOfDirectorsSection.tsx`, plus National and Area positions.
- **BoardTerm:** `org`, `year`, `start`, `end`.
- **PositionHolding:** `person`, `org` (any level), `term`, `positionType`, `start`, `end`. Replaces `boardHistory`, `boardMembers` and `isCurrentBoardMember`.

**Controllers:**
- **Membership type computation:** a port of `computeMembershipTypeFromMember` / `suggestMembershipTypeForMember` from `services/membershipConfigService.ts`. It never downgrades Official, keeps Honorary, and applies the Senator check, the age limits (18–40, Associate at 41+) and the nationality rule (non-Malaysians become Visiting).
- **Probation → Official promotion:** checks the four requirements from `services/promotionService.ts` (BOD meeting, event organising committee, event participation, JCI Inspire). In phase 1 the progress is recorded manually or imported, because the events module doesn't exist yet.
- **Dues generation:** the `generateDues(year)` method plus a scheduled function, porting `functions/src/membership.ts`.
- **Access sync:** whenever a PositionHolding or RoleAssignment is saved, rebuild the affected `userAccess`.

## UI

**Desk** (roles above Member):
- Generic list view: filters, sort, search over the cached org-scoped list (enough at KL scale; Typesense can come later), paging, CSV export.
- Generic form view: tabs/sections, Link pickers, child tables, a Timeline showing versions.
- Organisation tree admin, role assignment, custom-field editor.
- Board term view: grid of positions per year.
- Membership rules editor.
- Dues dashboard.

**Portal** (members):
- Home.
- My profile: permlevel-0 fields only.
- My membership and dues, with ToyyibPay payment.
- Directory, which respects the privacy flags.
- Board of the current term.
- Mobile uses the same routes. The Desk on mobile renders simplified RN lists and forms.

All of the screens above are assembled only from `@jci/ui` components and layouts.

## Payments
- Port `toyyibpay-api.mjs` / `toyyibpay-callback.mjs` into `_shared` helpers, keeping Eric's safeguards:
  - The callback URL carries a shared secret.
  - A transaction lock on `toyyibpay_webhooks/{txId}` makes sure each payment is processed once.
  - The callback re-checks the bill with `getBillTransactions` instead of trusting the POST body.
  - Sandbox or production mode comes from config.
- A confirmed payment updates `MembershipDues` through the same save pipeline, so it is versioned too.

## Migration (scripts/migrate-eric)

**Reading the old data:**
- Read the old project with an admin service account.
- `members` →
  - `Person` + `Membership` (loId `jcikl` → JCI KL org)
  - `MembershipDues` (from `membershipDuesHistory`)
  - `Senatorship`
  - `PositionHolding` (from `boardHistory` + `boardMembers`)
- `boardTermSettings` → `BoardTerm`. `systemSettings/membershipRules` → `MembershipTypeRule`.
- Reuse the field knowledge in `scripts/lark/migrate-firestore-to-lark.mjs` and `services/dataImportExportService.ts`.

**Auth:**
- `firebase auth:export` from the old project, then `auth:import` with the old hash config into the new one. This preserves UIDs and passwords, so members don't need to reset anything.

**Safety:**
- Deterministic IDs make re-runs idempotent.
- `--dry-run` prints a reconcile report: counts per type and status, and any members with unmapped or invalid fields.
- Cutover: run it repeatedly while the two systems are live in parallel; after sign-off, freeze Eric and do a final run.

## Later modules (each gets its own spec → plan → build)
1. **Events:** registration, check-in, payments. It will feed the probation progress.
2. **Finance:** chart of accounts, journal, receipts, claims, budgets.
3. **Workflow engine:** Frappe-style states and approvals, reused by finance and events.
4. **LMS:** courses, lessons, progress, certificates.
5. Notifications (email/push) and reports/insights.

## Verification
- **Unit tests** (`packages/core`, `packages/doctypes`) with Vitest, covering:
  - The permission evaluator: role × org scope × permlevel, including descendant inheritance.
  - Zod generation, including custom fields.
  - Naming series.
  - The membership type computation, as table tests copied from the cases in Eric's rules.
  - Dues calculation, including the RM50 first-year fee.
- **UI library:**
  - The lint rule has a test: a fixture importing `View` from `react-native` or using `className` inside `apps/app` must fail lint.
  - `npm run lint` runs in CI.
  - Component unit tests (`@testing-library/react-native`) cover variants and accessibility props.
  - The `/ui-gallery` route is reviewed on web and on a device in both themes.
- **Firestore rules tests** with `@firebase/rules-unit-testing` in the emulator:
  - A member cannot read another org's private data or write DocType collections directly.
  - A National officer can read the Local subtree.
- **API integration:** `netlify dev` against the Firebase emulators.
  - Create/update a Person as a MembershipOfficer, and check that a version is written.
  - As a Member, try to change a permlevel-1 field and check it is rejected.
- **Migration:** a dry run against a real export of the Eric project. The reconcile report's counts must match the source.
- **Manual end-to-end** with `npx expo start --web` plus the iOS/Android Expo Go app:
  - Log in as an admin: create an org and a member, and assign the Treasurer position.
  - Confirm the Treasurer role takes effect.
  - Log in as a member: edit your profile and pay dues through ToyyibPay sandbox; confirm the dues status updates and the timeline shows the change.

## First execution steps after approval
1. `git init` the Frappe folder, then write and commit the design spec to `docs/superpowers/specs/2026-09-29-jci-platform-core-member-crm-design.md`.
2. Run the writing-plans skill to produce the detailed task-by-task implementation plan, milestones M1 to M7:
   - M1: scaffold + core + `@jci/ui` foundation (tokens, primitives, base components, lint enforcement, gallery)
   - M2: API + rules + audit
   - M3: Desk renderer (`@jci/ui` fields/ and desk/)
   - M4: membership DocTypes
   - M5: Portal
   - M6: dues + ToyyibPay
   - M7: migration + cutover
