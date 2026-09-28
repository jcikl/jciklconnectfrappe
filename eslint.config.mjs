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
  // App code: UI only via @jci/ui.
  {
    files: ['apps/app/**/*.{ts,tsx}', 'packages/doctypes/**/*.{ts,tsx}'],
    plugins: { jci },
    rules: {
      'no-restricted-imports': ['error', RESTRICTED_UI_IMPORTS],
      'jci/no-raw-styling': 'error',
      'jci/no-hex-colors': 'error',
    },
  },
  // The library itself may use primitives and className, but colours still come only from tokens.json.
  {
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    plugins: { jci },
    rules: { 'jci/no-hex-colors': 'error' },
  },
);
