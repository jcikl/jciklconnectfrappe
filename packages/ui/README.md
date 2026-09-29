# @jci/ui — the only UI/UX library for the JCI platform

**Rule:** every screen in `apps/app` (and any UI in `packages/doctypes`) is built only from `@jci/ui` exports. `npm run lint` fails on any of these:
- importing React Native view primitives, NativeWind, icon or animation libraries, TanStack, clsx or tailwind-merge outside this package
- passing `className`, `style` or `contentContainerStyle`
- writing a hex colour literal anywhere except `src/tokens/tokens.json`

## Adding or changing UI
1. Need something that doesn't exist? Build it here first: `src/primitives/` for layout and typography, `src/components/` for everything else, `src/layouts/` for full-screen shells.
2. Give it semantic props (`variant`, `size`, `tone`). Never accept `className` or `style`.
3. Tailwind classes must be literal strings in lookup maps (`const TONE = { muted: 'text-text-muted dark:text-text-muted-dark' }`). Never build class names at runtime.
4. Every colour is a semantic token used as a pair: `bg-surface dark:bg-surface-dark`. New colours go in `tokens.json`, and `contrast.test.ts` must still pass (WCAG AA).
5. Accessibility is built in: `accessibilityRole` and `accessibilityLabel`, `min-h-11` (44 px) touch targets, and web focus rings.
6. Add tests in `__tests__/`, export the component from `src/index.ts`, and add it to the gallery (`apps/app/app/(dev)/ui-gallery.tsx`) with every variant.

## Scripts
- `npm test -w @jci/ui` runs Jest (jest-expo + React Native Testing Library).
- The gallery runs at `/ui-gallery` in dev builds.
