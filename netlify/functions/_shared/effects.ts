import { ROLE_ASSIGNMENT_DOCTYPE } from '@jci/core';
import { rebuildUserAccess } from './access';
import type { EffectMap } from './pipeline';

/** Post-commit effects for the deployed API. */
export const serverEffects: EffectMap = {
  [ROLE_ASSIGNMENT_DOCTYPE]: async ({ db, registry, before, after }) => {
    const uids = new Set<string>();
    for (const doc of [before, after]) if (typeof doc?.uid === 'string') uids.add(doc.uid);
    // Attempt every uid even if one fails, so a bad rebuild cannot leave the others stale.
    const failed: string[] = [];
    for (const uid of uids) {
      try {
        await rebuildUserAccess({ db, registry }, uid);
      } catch (err) {
        console.error(`userAccess rebuild for "${uid}" failed`, err);
        failed.push(uid);
      }
    }
    if (failed.length > 0) throw new Error(`userAccess rebuild failed for: ${failed.join(', ')}`);
  },
};
