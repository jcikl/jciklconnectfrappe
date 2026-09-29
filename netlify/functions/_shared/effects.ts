import { ROLE_ASSIGNMENT_DOCTYPE } from '@jci/core';
import { rebuildUserAccess } from './access';
import type { EffectMap } from './pipeline';

/** Post-commit effects for the deployed API. */
export const serverEffects: EffectMap = {
  [ROLE_ASSIGNMENT_DOCTYPE]: async ({ db, registry, before, after }) => {
    const uids = new Set<string>();
    for (const doc of [before, after]) if (typeof doc?.uid === 'string') uids.add(doc.uid);
    for (const uid of uids) await rebuildUserAccess({ db, registry }, uid);
  },
};
