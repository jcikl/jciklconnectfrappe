import { readFileSync } from 'node:fs';
import { generateFirestoreRules } from '@jci/core';
import { describe, expect, it } from 'vitest';
import { registry } from './index';

describe('firestore.rules', () => {
  it('matches the rules generated from the registry (run `npm run gen:rules` after changing DocTypes)', () => {
    const committed = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(generateFirestoreRules(registry.all()));
  });
});
