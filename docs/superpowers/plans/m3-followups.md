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

## Carried from M3a reviews
- **Access and list filters.**
  - Before the first `ifOwner` DocType: prove the global-owner and subtree-owner filter shapes against the emulator rules. Today only exact-scope owner reads are proven.
  - Tests cover only the first scope option, and negative rule cases are few (no denied subtree or global shapes).
  - A parent-org subtree grant is ignored when the scope is a child org. This under-lists, which is safe, but it is surprising.
  - `docTypeLabel` does not keep acronyms.
- **API client (before M3b).**
  - Wrap `getIdToken` failures in `ApiRequestError`.
  - Treat a 2xx response without `data` as an error instead of returning `{}`.
- **Stores.**
  - If `start` throws, the listener stays registered.
  - A store keeps its last value when it is resubscribed, so a remount can briefly show stale state.
  - No tests for a missing doc, an empty list, or a cache hit while loading (a manual probe passed).
  - `includeMetadataChanges` causes metadata-only re-renders.
  - The `react.tsx` hooks have no tests.
- **Tooling.**
  - A bare `vitest --project emulator` still runs files in parallel; only the npm script passes `--no-file-parallelism`.
  - `@react-native-async-storage/async-storage` uses a `^2.2.0` range in `@jci/client`.
  - Lint does not stop app code importing `firebase/*`, or `@jci/client` importing React Native UI.
- **UI components.**
  - The `Page` test does not check the scroll switch.
  - A non-pressable selected `ListItem` does not announce its selected state.
  - The wide `DeskShell` layout and the optional `AuthShell` paths have no tests.
  - The Desk nav has no navigation landmark role.
  - On narrow screens, focus is lost after picking a nav item.
  - Keeping Desk content mounted relies on its position in the tree.
- **Sign-in and the Desk.**
  - The Google popup flow has no automated test. The built-in browser pane cannot complete it, because it opens the popup in the same tab.
  - Google sign-in errors appear under the Password field. Show a form-level message instead.
  - A deep link opened while signed out goes to `/desk` after sign-in instead of its target, and the scope is not kept in the URL.
  - The Desk sign-out promise is unhandled, and the list `ErrorState` has no retry.

## Deferred from M3b
- **Delete** is not in the Desk yet (the API supports it). Add it with a confirmation step.
- **Tabs** (`FieldDef.tab`) are ignored; only sections group fields.
- **Date and Datetime** are text inputs with a format hint. **AttachImage** is an image URL. Native pickers and upload come later.
- **No DocType has a Table field yet.** `ChildTable` is covered by unit tests and `/gallery-fields` only; exercise it end-to-end when M4 adds one.
- **Concurrent edits:**
  - The form keeps the values it loaded. A change saved elsewhere meanwhile is only noticed through the diff: fields the user did not touch are not sent, and fields they did touch overwrite it.
  - Detecting conflicts needs a version check in the API.
- **After a remote change** the heading and the Timeline reflect the new value while the fields keep the loaded one, with no indicator.
- **No save confirmation.** The new Timeline entry is the only sign of a successful update, and only for tracked DocTypes. A create by a role that cannot read the result returns to the list without a message.
- **Link pickers** list up to `LIST_LIMIT` documents of the target in the current scope, with no server-side search.
- **Creating an Organization** checks create permission against the scope (parent) org. An admin with an exact grant at the parent sees **New** but the server refuses; the form shows that message.
- **The `/desk/[doctype]/new` route** shadows a document whose id is `new`.
- **Invalid custom field definitions** make the form show "Could not load the form" with the validation message, instead of silently dropping the field.
- **Read permlevels are enforced only by the API.** Firestore rules cannot redact fields. The raw documents and version docs that a reader can query therefore contain fields above their permlevel. The Desk hides them, but a direct SDK read does not.
- The Timeline says "by <uid>" and does not resolve a display name.
- **Fields fixed after create are editable on update, but the controller refuses changes to them.** This affects Organization `code` and `level`, and CustomField's fixed fields. `FieldDef` needs a flag such as `setOnlyOnCreate` so the form can lock them.
- An empty create form shows raw zod messages (e.g. "expected string, received undefined").
- A member sees the raw Parent id instead of the Organization name.
- Read-only text inputs use `readOnly`, while Select and Checkbox use `disabled`. They are inconsistent.
- **M4, ChildTable.** With `rowsFixed` and a locked required child column, an appended row can never be valid.
- **M4, Person transfers.** Version history filters use the document's current `orgId`/`orgPath`, so versions saved under an earlier path drop out.
- There is no unit test checking that every `filtersForDoc` shape has a composite index in `firestore.indexes.json`.
- `isCapped` reports capped at exactly 100 versions. Fetch `max + 1` to fix it.
