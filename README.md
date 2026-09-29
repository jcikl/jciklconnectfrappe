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
   - Why the prebuild: Netlify bundles v2 functions with NFT and keeps every package import external, so the raw TypeScript workspace packages would otherwise be loaded as `.ts` at runtime.

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
