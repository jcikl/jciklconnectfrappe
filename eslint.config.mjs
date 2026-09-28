import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import jci from './tools/eslint-plugin-jci/index.mjs';
import { RESTRICTED_UI_IMPORTS } from './tools/eslint-plugin-jci/restricted-imports.mjs';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/.expo/**',
      '**/dist/**',
      '**/web-build/**',
      '**/*.d.ts',
      '**/*.config.js',
      'packages/ui/tailwind-preset.js',
      'packages/ui/jest.setup.js',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['tools/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
  // Parse JSX in every source file we enforce rules on, including .js/.jsx.
  {
    files: ['apps/app/**/*.{js,jsx,mjs,cjs}', 'packages/doctypes/**/*.{js,jsx,mjs,cjs}', 'packages/ui/src/**/*.{js,jsx,mjs,cjs}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  // App code: UI only via @jci/ui.
  {
    files: ['apps/app/**/*.{js,jsx,ts,tsx,mjs,cjs}', 'packages/doctypes/**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    plugins: { jci },
    rules: {
      'no-restricted-imports': ['error', RESTRICTED_UI_IMPORTS],
      'jci/no-restricted-dynamic-imports': 'error',
      'jci/no-raw-styling': 'error',
      'jci/no-hex-colors': 'error',
    },
  },
  // The library itself may use primitives and className, but colours still come only from tokens.json.
  {
    files: ['packages/ui/src/**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    plugins: { jci },
    rules: { 'jci/no-hex-colors': 'error' },
  },
);
