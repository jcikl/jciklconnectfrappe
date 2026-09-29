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
4. `npm run build:web && npm run dev:api`. The API is then at `http://localhost:8888/api/resource/:doctype[/:id]`.
   - `dev:api` runs `npm run build:functions` (esbuild bundles `netlify/functions/*.ts` together with `@jci/core` and `@jci/doctypes` into `netlify/dist`, the functions directory in `netlify.toml`) and then `netlify dev --filter @jci/functions`. The filter is needed because the repo has several workspaces. Add `--offline` to skip the Netlify login: `npm run dev:api -- --offline`.
   - The bundle is not rebuilt on change: rerun `npm run dev:api` after editing server code.
   - The web page served at :8888 is a production build, so it shows "This build is not configured" unless `apps/app/.env` sets `EXPO_PUBLIC_USE_EMULATORS=true`.
   - Why the prebuild: Netlify bundles v2 functions with NFT and keeps every package import external, so the raw TypeScript workspace packages would otherwise be loaded as `.ts` at runtime.

## Running the app locally

1. `npm run emulators` (leave it running).
2. `npm run seed:dev`. This creates the org tree and two emulator-only accounts. Both use the password `jci-dev-password`:
   - `admin@jci.test`: System Manager for everything
   - `member@jci.test`: Member at JCI Kuala Lumpur
3. `cd apps/app`, then one of:
   - `npx expo start --web` for the browser at http://localhost:8081
   - `npx expo start`, then press `a` for the Android emulator. Expo Go reaches the PC at `10.0.2.2`.
4. Sign in. The Desk lists only the DocTypes your roles can read. Lists come straight from Firestore through the generated rules.

Opening a record shows its form and history. Creating and saving go through `/api/resource`, so run `npm run dev:api -- --offline` alongside (with `cp .env.example .env` first; it allows the Expo web origin). The form checks your changes with the same schema the server uses, and only the fields your roles may change are editable.

If `npm run typecheck` rejects a new route, delete `apps/app/.expo/types` or run `npx expo start` once; the typed-route file is generated locally and ignored by git.

The app reads these `EXPO_PUBLIC_*` variables. Put them in `apps/app/.env`: Expo does not read the root `.env`, which is only for the API.
- `EXPO_PUBLIC_USE_EMULATORS`: `true` or `false` overrides the default (on in dev, off in production builds).
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID` and `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` (default `<projectId>.firebaseapp.com`) and `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_EMULATOR_HOST`
- `EXPO_PUBLIC_API_BASE_URL`

In dev (`expo start`) the defaults target the `demo-jci` emulators and the API on port 8888.

Production builds (`npm run build:web`, EAS builds) turn the emulators off:
- The Firebase project id and API key are then required. Without them the build still succeeds, but the app shows "This build is not configured" instead of starting.
- On web the API defaults to the same origin, where the Netlify function lives. A native build must set `EXPO_PUBLIC_API_BASE_URL`.

## How writes work

Clients read Firestore directly; the generated rules scope those reads by org. Every write goes through `/api/resource`, which runs one transaction with these steps:

1. Check permissions.
2. Check field locks.
3. Validate with Zod.
4. Run the controller hooks.
5. Check links and unique values.
6. Write the document, its version entry and its naming counter.

Server-only effects run in the same transaction when they must commit with the change: a RoleAssignment save writes `userAccess` atomically, so a revocation cannot be lost. Post-commit effects run after the transaction; there are none in M2.

## Layout

| Path | What it holds |
| --- | --- |
| `packages/core` | The pure TypeScript engine: meta, validation, permissions, diff, the rules generator |
| `packages/doctypes` | DocType definitions and their controllers |
| `packages/client` | `@jci/client`: the Firebase client, live Firestore stores and the `/api/resource` client; `@jci/client/react` has the hooks |
| `packages/ui` | `@jci/ui`, the only UI library app code may use |
| `apps/app` | The Expo Router app |
| `netlify/functions` | `/api/resource` and its `_shared/` modules |
| `tests/emulator` | Tests that run against the Firebase emulators |
