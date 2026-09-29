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
4. `npm run build:web && netlify dev --filter @jci/functions` (the filter is needed because the repo has several workspaces). The API is then at `http://localhost:8888/api/resource/:doctype[/:id]`.

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
