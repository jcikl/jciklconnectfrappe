import { ROLE_ASSIGNMENT_DOCTYPE } from '@jci/core';
import { syncUserAccessInTx } from './access';
import type { EffectMap, TxEffectMap } from './pipeline';

/** Post-commit effects for the deployed API. None in M2; each must be idempotent (see EffectMap). */
export const serverEffects: EffectMap = {};

/** Effects that commit with the save. RoleAssignment keeps userAccess in step, revocations included. */
export const serverTxEffects: TxEffectMap = {
  [ROLE_ASSIGNMENT_DOCTYPE]: syncUserAccessInTx,
};
