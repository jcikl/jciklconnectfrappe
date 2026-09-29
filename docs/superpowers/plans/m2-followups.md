# M2 follow-ups (carry into M3 and M4)

## Needed before deployment
- **Set `NODE_OPTIONS=--experimental-require-module` for Functions in the Netlify UI.** Netlify runs functions on AWS Lambda, which disables `require()` of ES modules on Node 22. `firebase-admin/auth` loads `jwks-rsa`, which does `require('jose')` (ESM-only), so the function fails to load without it. `.env.example` sets it for `netlify dev`, which copies Lambda's behaviour. Recheck when the functions runtime moves to Node 24, where `require(esm)` is stable.
- The deploy build runs `npm run build:web && npm run build:functions` (`netlify.toml`). `build:functions` bundles the workspace packages into `netlify/dist`; this was checked with a local zip-it-and-ship-it run, not a real deploy.

## Needed by M4 (membership DocTypes)
- **Firestore rules cannot hide fields.**
  - Permlevel read limits apply to API responses only. A client with read access to a document reads every field directly from Firestore.
  - Put sensitive data (for example IC number or bank details) in its own DocType, with narrower read roles.
- **Set `userAccess.personId`.** `syncUserAccessInTx` and `rebuildUserAccess` preserve it but nothing sets it yet. Look it up from `Person.authUid`, and rebuild on Person save.
- **Choose document owners.** `ownerPersonId` is the creator's personId. Person and Membership need a controller-level way to set the owner (a Person owns itself), so `ifOwner` rows mean "my own record".
- **Grant roles from board positions.** Add a PositionRoleMap tx-effect alongside the RoleAssignment one in `serverTxEffects` (`netlify/functions/_shared/effects.ts`), so derived grants commit with the save.
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
- **Effects (Decision 7, as built).**
  - Work that must be consistent with the change is a **tx-effect** (`PipelineDeps.txEffects`, `serverTxEffects`). It runs inside the save transaction after every other read, and its writes commit with the document. RoleAssignment uses one to write `userAccess` for the uid before and after the change, so a grant or revocation can never commit without its `userAccess` update. A no-op update also runs it, so saving an assignment again repairs a stale `userAccess`.
  - Other follow-up work is a **post-commit effect** (`PipelineDeps.effects`, `serverEffects`, empty in M2). Effects must be idempotent: they run on every create, update (including a no-op update) and delete. If one fails the API returns `500 effect_failed` and the change stays committed.
  - After a failed create or update, updating the document again, even with the same data, re-runs the post-commit effect. Do not retry by creating again: that makes a second document for autoname DocTypes. A failed effect after a **delete** cannot be retried this way, because the document is gone and a second delete returns 404; the message says to ask an administrator. There is no background retry, so M3+ post-commit effects that follow deletes need a repair path or should be tx-effects.
- There is no GET API; reads go straight to Firestore.
- M2 has no real Firebase project. Creating the project, its service account (`FIREBASE_SERVICE_ACCOUNT`) and `firebase deploy --only firestore:rules` belong to the deployment milestone.
- Revoked or disabled users keep API access until their ID token expires (about an hour): `verifyIdToken` does not use `checkRevoked`.

## Minor backlog from M2 reviews
Open items from the per-task reviews (`.superpowers/sdd/progress.md`) and the final whole-branch review. None blocks M3.

### Core engine (`packages/core`)
- `childSchemas` WeakMap is keyed by the child meta only and ignores `resolveChild`.
- `DocAccess.redact` recomputes read levels on every call; child-table rows are compared by index.
- Make `redactDoc` internal: `DocAccess.redact` is the safe path, and the export invites leaks.
- `customFieldFromDoc` uses `String()`, so a missing value becomes `'undefined'`.
- Rules generator: `hasRole` passes on `orgId in exact` even when `orgPath` is missing (the server denies); consider `d.orgPath.size() > 0`. The generator trusts its input.
- Add a server/rules parity table test before M4: one table of (user, doc, action) cases run through `resolveDocAccess` and the emulator rules.
- Test gaps: delete at permlevel > 0, non-Data/Select naming field types, `fields` naming with a missing field and multi-field joins, `dependsOn` freeze, evaluate tests beyond the create path, permlevel 0 and non-string `options` custom fields, global `ifOwner` rules, empty registry.

### Core DocTypes (`packages/doctypes`)
- Organization: `String(undefined)` passes the code regex; an hq org with a missing parent is not rejected.
- Deleting an Organization orphans its children and their role assignments, and reusing the code later re-attaches the old grants. Block deletes of orgs with children or assignments, or cascade.
- Organization custom fields load with `parentPath` on create but with the org's own `orgPath` on update, so create and update can see different field sets.
- CustomField `options` and `link` can still change after create, which can strand stored values. Fix early in M3.
- An admin with an exact (non-subtree) grant can add a custom field at a non-leaf org, and `loadCustomFields` then applies it, even `reqd`, to every org below. Require a subtree grant when `org` has children, or always, to match `coversSubtree`.

### Pipeline and API (`netlify/functions`)
- Link checks and unique-value 409s reveal whether a document exists in another org. Decide whether to answer as "not found" or accept the leak.
- `planUniques` releases the old claim without checking it is owned by this document. This matters for M7-imported data that has no claims.
- LATENT: if custom fields ever gain `unique`, `deleteDoc` must load custom fields (it passes `customFields: []`) or their claims orphan.
- Unique values are case-sensitive (for example email). Deleting a document that others link to is allowed.
- `planId` returns 422 before the 403 permission check.
- `serializeDoc` flattens GeoPoint and DocumentReference values; the naming sort comparator never returns 0.
- Auth: a key-fetch failure and `auth/invalid-credential` still map to 401, and the comment overstates that. OPTIONS gets a 500 on a setup failure.
- The versions timeline query shape is still open: filter by `doctype` plus `orgId` or `orgPath` to match the rules, and add the composite index that `orderBy('at')` needs.
- Test gaps: no concurrency test for userAccess; tests hardcode `'roleAssignments'`; update-time unique conflicts, multi-field uniques, custom Link fields; a pipeline test that the response omits unreadable fields; DELETE without an id, CORS headers on success, no leak in 500 bodies; `planId` deferring its writes.

### Rules tests (`tests/emulator/rules.test.ts`)
- The deny-writes cases are bundled in one test; `customFields` writes are not exercised; an officer without admin reading `roleAssignments` is untested.

### Tooling and dependencies
- A bare `vitest run` fails on the emulator project without the emulators; use the npm scripts.
- `npm audit` reports a moderate `uuid <11.1.1` advisory through `firebase-admin`. Recheck when firebase-admin updates. The lockfile churn from M2 is large (about 17k lines).
- `netlify dev` can serve a stale bundle if `build:functions` is not re-run; `seed-dev` relies on the emulator host env vars.
- UI: the `input-dark` test comment says "on web" but it runs the native renderer; there is no NativeWind dynamic-import row.
