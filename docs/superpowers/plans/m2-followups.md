# M2 follow-ups (carry into M3 and M4)

## Needed before deployment
- **`netlify dev` cannot load the function yet.** `/api/resource` is a v2 function, so Netlify bundles it with NFT, not esbuild. NFT leaves `@jci/core` and `@jci/doctypes` as unbundled TypeScript, and Node fails with `Unknown file extension ".ts"`. Fix before deploying: build the workspace packages to JS, or bundle the function with esbuild in a build step. `NODE_OPTIONS=--import tsx` did not reach the function worker. The API was smoke-tested by calling the handler under `tsx` against the emulators instead.

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
- Revoked or disabled users keep API access until their ID token expires (about an hour): `verifyIdToken` does not use `checkRevoked`.
