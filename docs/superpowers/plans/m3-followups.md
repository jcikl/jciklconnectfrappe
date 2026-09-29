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
