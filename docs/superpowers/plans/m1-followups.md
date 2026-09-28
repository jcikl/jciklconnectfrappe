# M1 follow-ups (carry into the M2 plan)

These are the items the M1 final review deferred. The first two belong in the first M2 commit.

## Should fix early in M2
- **Lint: deep subpaths get around the react-native allowlist.** `import View from 'react-native/Libraries/Components/View/View'` and `import { cssInterop } from 'nativewind/dist/runtime'` both pass lint.
  - Fix: add `'react-native/*'` and `'nativewind/*'` to the `patterns` group in `tools/eslint-plugin-jci/restricted-imports.mjs`. The dynamic-import rule derives its lists from that group, so it picks this up automatically.
  - Add enforcement-table rows for both imports.
- **UI: the Input placeholder colour is tested only in light mode.** Add a dark-scheme assertion; the original bug was the dark-mode placeholder on web.

## Needed by the M2 save pipeline (`/api/resource`)
- **Add a single `resolveDocAccess(meta, customFields, user, doc)` facade in `@jci/core`.** It returns `{ canRead, canWrite, readableFields, unwritableKeys, schema }`, so the pipeline can't call the pieces in the wrong order or skip `can()`.
- **Decide how `orgScoped: false` DocTypes are evaluated.** The current idea is to pass `orgPath = [hqId]`; an empty orgPath denies everyone.
- **Set `ownerPersonId` and `orgPath` on the server before `can()` on create.** Derive `orgPath` from the parent Organization.
- **Evaluate child-table field `permlevel`/`readOnly` in `unwritableKeys`.** Nested keys are not expanded today.
- **Validate `DocPerm` at runtime** once DocTypes or CustomField rows come from Firestore:
  - `role` must be one of `ROLES`
  - `permlevel` must be between 0 and `MAX_PERMLEVEL`
- **Memoise child schemas per registry**, and remove the `z.enum` double-cast.

## Known lint limits (accepted; revisit if abused)
- `import(variable)` with a non-literal argument
- spreading a variable (`<Text {...p}>`) or a computed key (`{['className']: x}`)
- `createElement(Box, { style })`
- hex colours inside template literals or Tailwind arbitrary values (`bg-[#…]`)
- expo-router `screenOptions` style keys (`contentStyle`, `headerStyle`)
- `.cjs` files under apps/app get no node globals (none exist today)
- type-only react-native imports are rejected; add `allowTypeImports: true` if needed

## Minor
- Button `accessibilityState.busy` is not surfaced as `aria-busy` on web.
- `defineDocType` freezes shallowly: nested `options` and `dependsOn` stay mutable.
- A `naming.kind: 'field'` target is not required to be `reqd`.
- Add more contrast-test pairs:
  - success and warning text on surface
  - text on surfaceMuted
  - the focus ring, at the 3:1 non-text minimum
- Remove unused template dependencies from `apps/app/package.json`: `@expo/ui`, `expo-glass-effect`, `expo-symbols`, `expo-image` and others.
- Consider replacing the global `.npmrc` `legacy-peer-deps=true` with a targeted `overrides` entry.
