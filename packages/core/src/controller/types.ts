import type { Registry } from '../meta/registry';
import type { DocTypeMeta } from '../meta/types';
import type { UserContext } from '../perm/evaluate';

/** A document as stored in Firestore, system fields included. */
export type StoredDoc = Record<string, unknown>;

export interface HookContext {
  readonly meta: DocTypeMeta;
  readonly registry: Registry;
  readonly user: UserContext;
  readonly isNew: boolean;
  readonly id: string;
  /** Org path of the document; null for global (orgScoped: false) DocTypes. */
  readonly orgPath: readonly string[] | null;
  /** The stored document before this change; null on create. */
  readonly before: StoredDoc | null;
  /** The fields being saved, without system fields. beforeSave may change them. On delete: the old fields. */
  doc: Record<string, unknown>;
  /** Reads another document inside the same transaction. */
  get(doctype: string, id: string): Promise<StoredDoc | null>;
}

/**
 * Pure DocType logic, shared by client and server. Throw ValidationError to reject a change.
 * Side effects, in-transaction or post-commit, are server-only (netlify/functions/_shared/effects.ts).
 */
export interface Controller {
  validate?(ctx: HookContext): void | Promise<void>;
  beforeSave?(ctx: HookContext): void | Promise<void>;
  beforeDelete?(ctx: HookContext): void | Promise<void>;
}

export type ControllerMap = Readonly<Record<string, Controller>>;
