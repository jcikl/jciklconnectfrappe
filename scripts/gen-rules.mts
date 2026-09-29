import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateFirestoreRules } from '@jci/core';
import { registry } from '@jci/doctypes';

const target = fileURLToPath(new URL('../firestore.rules', import.meta.url));
writeFileSync(target, generateFirestoreRules(registry.all()));
console.log(`Wrote ${target}`);
