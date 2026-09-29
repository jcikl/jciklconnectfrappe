import {
  buildOrgPath,
  diffDocs,
  ORGANIZATION_DOCTYPE,
  resolveDocAccess,
  SYSTEM_FIELDS,
  ValidationError,
  VERSIONS_COLLECTION,
  type Change,
  type ControllerMap,
  type DocAccess,
  type DocTypeMeta,
  type HookContext,
  type Registry,
  type StoredDoc,
  type UserContext,
} from '@jci/core';
import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { ApiError, invalid } from './errors';
import { checkLinks } from './links';
import { datePartsIn, isValidDocId, planId, type PendingWrite } from './naming';
import { docRef, loadCustomFields, loadOrgPath, readDoc, serializeDoc } from './store';
import { planUniques } from './unique';

export interface EffectContext {
  db: Firestore;
  registry: Registry;
  doctype: string;
  id: string;
  /** Stored document before the change; null on create. */
  before: StoredDoc | null;
  /** Stored document after the change; null on delete. */
  after: StoredDoc | null;
}

/** Server-only follow-up work, run after a change commits (for example rebuilding userAccess). */
export type EffectMap = Readonly<Record<string, (ctx: EffectContext) => Promise<void>>>;

export interface PipelineDeps {
  db: Firestore;
  registry: Registry;
  controllers: ControllerMap;
  effects?: EffectMap;
  now?: () => Date;
  /** Time zone for naming-series dates. Default Asia/Kuala_Lumpur. */
  timeZone?: string;
}

export interface SaveResult {
  id: string;
  /** The saved document as the caller may read it, JSON-safe. */
  doc: Record<string, unknown>;
  changed: Change[];
}

const DEFAULT_TIME_ZONE = 'Asia/Kuala_Lumpur';
const SYSTEM = new Set<string>(SYSTEM_FIELDS);

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

function requireDocType(registry: Registry, doctype: string): DocTypeMeta {
  if (!registry.has(doctype) || registry.get(doctype).isChild) {
    throw new ApiError(404, 'unknown_doctype', `Unknown DocType "${doctype}"`);
  }
  return registry.get(doctype);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ApiError(400, 'bad_request', 'data must be a JSON object');
  return value;
}

function notFound(meta: DocTypeMeta, id: string): ApiError {
  return new ApiError(404, 'not_found', `${meta.name} "${id}" not found`);
}

/** Org path used for permissions. An org-scoped document without one denies everyone. */
function storedOrgPath(meta: DocTypeMeta, doc: StoredDoc): string[] | null {
  if (!meta.orgScoped) return null;
  return Array.isArray(doc.orgPath) ? (doc.orgPath as string[]) : [];
}

function split(doc: StoredDoc): { fields: Record<string, unknown>; system: Record<string, unknown> } {
  const fields: Record<string, unknown> = {};
  const system: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) (SYSTEM.has(k) ? system : fields)[k] = v;
  return { fields, system };
}

/** Top-level keys replace; `custom` merges one level deep. */
function applyPatch(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base, ...patch };
  if (isRecord(patch.custom)) merged.custom = { ...(isRecord(base.custom) ? base.custom : {}), ...patch.custom };
  return merged;
}

function assertWritable(access: DocAccess, patch: Record<string, unknown>, before: StoredDoc | null): void {
  const locked = access.unwritableKeys(patch, before);
  if (locked.length > 0) {
    throw new ApiError(403, 'field_not_writable', 'You cannot change some of these fields', { fields: locked });
  }
}

function parseOrThrow(access: DocAccess, mode: 'create' | 'update', data: Record<string, unknown>): Record<string, unknown> {
  const result = access.schema(mode).safeParse(data);
  if (!result.success) {
    throw invalid(result.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })));
  }
  return result.data as Record<string, unknown>;
}

function contextFor(tx: Transaction, deps: PipelineDeps, init: Omit<HookContext, 'registry' | 'get'>): HookContext {
  return {
    ...init,
    registry: deps.registry,
    get: (doctype, id) => (isValidDocId(id) ? readDoc(tx, docRef(deps.db, deps.registry.get(doctype), id)) : Promise.resolve(null)),
  };
}

async function runHooks(deps: PipelineDeps, ctx: HookContext, phase: 'save' | 'delete'): Promise<void> {
  const controller = deps.controllers[ctx.meta.name];
  try {
    if (phase === 'delete') {
      await controller?.beforeDelete?.(ctx);
    } else {
      await controller?.validate?.(ctx);
      await controller?.beforeSave?.(ctx);
    }
  } catch (err) {
    if (err instanceof ValidationError) throw invalid([{ path: err.field ?? '', message: err.message }], err.message);
    throw err;
  }
}

function versionEntry(
  meta: DocTypeMeta,
  id: string,
  action: 'create' | 'update' | 'delete',
  changed: Change[],
  doc: StoredDoc,
  uid: string,
  at: Timestamp,
): Record<string, unknown> {
  return {
    doctype: meta.name,
    docId: id,
    action,
    // Firestore cannot store nested arrays, so each change is a map.
    changed: changed.map(([field, oldValue, newValue]) => ({ field, old: oldValue ?? null, new: newValue ?? null })),
    by: uid,
    at,
    ownerPersonId: doc.ownerPersonId ?? null,
    ...(meta.orgScoped ? { orgId: doc.orgId, orgPath: doc.orgPath } : {}),
  };
}

async function runEffect(deps: PipelineDeps, meta: DocTypeMeta, id: string, before: StoredDoc | null, after: StoredDoc | null) {
  const effect = deps.effects?.[meta.name];
  if (!effect) return;
  try {
    await effect({ db: deps.db, registry: deps.registry, doctype: meta.name, id, before, after });
  } catch (err) {
    console.error(`Effect for ${meta.name} "${id}" failed`, err);
    throw new ApiError(500, 'effect_failed', 'The change was saved, but a follow-up step failed. Save it again to retry.');
  }
}

function respond(doc: StoredDoc, access: DocAccess, changed: Change[]): SaveResult {
  return { id: String(doc.id), doc: serializeDoc(access.redact(doc)) as Record<string, unknown>, changed };
}

export async function createDoc(
  deps: PipelineDeps,
  user: UserContext,
  doctype: string,
  input: { orgId?: unknown; data: unknown },
): Promise<SaveResult> {
  const meta = requireDocType(deps.registry, doctype);
  const raw = asRecord(input.data);
  const now = (deps.now ?? (() => new Date()))();
  const at = Timestamp.fromDate(now);
  const date = datePartsIn(deps.timeZone ?? DEFAULT_TIME_ZONE, now);
  const resolveChild = (name: string) => deps.registry.get(name);
  const isOrganization = meta.name === ORGANIZATION_DOCTYPE;

  const saved = await deps.db.runTransaction(async (tx) => {
    const data = { ...raw };
    let parentPath: string[] | null = null;
    if (meta.orgScoped) {
      if (typeof input.orgId !== 'string' || input.orgId === '') {
        throw new ApiError(400, 'org_required', `orgId is required to create ${meta.name}`);
      }
      parentPath = await loadOrgPath(tx, deps, input.orgId);
    } else if (input.orgId !== undefined) {
      throw new ApiError(400, 'bad_request', `${meta.name} is not scoped to an organisation, so do not send orgId`);
    }

    const planned = await planId(tx, deps.db, meta, data, date);
    // An Organization's own path extends its parent's; every other document sits in the given org.
    const orgPath = parentPath !== null && isOrganization ? buildOrgPath(parentPath, planned.id) : parentPath;
    const customFields = await loadCustomFields(tx, deps, meta, parentPath);
    const access = resolveDocAccess({ meta, customFields, user, doc: { orgPath, ownerPersonId: user.personId }, resolveChild });
    if (!access.canCreate) throw new ApiError(403, 'forbidden', `You cannot create ${meta.name} here`);
    assertWritable(access, data, null);
    if (isOrganization) data.parent = input.orgId;
    const parsed = parseOrThrow(access, 'create', data);

    const ref = docRef(deps.db, meta, planned.id);
    if ((await tx.get(ref)).exists) throw new ApiError(409, 'exists', `${meta.name} "${planned.id}" already exists`);
    const ctx = contextFor(tx, deps, { meta, user, isNew: true, id: planned.id, orgPath, before: null, doc: parsed });
    await runHooks(deps, ctx, 'save');
    const writes: PendingWrite[] = [...planned.writes];
    await checkLinks(tx, deps, access.fields, null, ctx.doc);
    writes.push(...(await planUniques(tx, deps.db, meta, access.fields, planned.id, null, ctx.doc)));

    const doc: StoredDoc = {
      ...ctx.doc,
      id: planned.id,
      ...(orgPath !== null ? { orgId: orgPath[orgPath.length - 1], orgPath } : {}),
      ownerPersonId: user.personId,
      createdAt: at,
      createdBy: user.uid,
      updatedAt: at,
      updatedBy: user.uid,
    };
    const changed = diffDocs(null, doc);
    for (const write of writes) write(tx);
    tx.create(ref, doc);
    if (meta.trackChanges) {
      tx.create(deps.db.collection(VERSIONS_COLLECTION).doc(), versionEntry(meta, planned.id, 'create', changed, doc, user.uid, at));
    }
    return { doc, changed, access };
  });

  await runEffect(deps, meta, String(saved.doc.id), null, saved.doc);
  return respond(saved.doc, saved.access, saved.changed);
}

export async function updateDoc(
  deps: PipelineDeps,
  user: UserContext,
  doctype: string,
  id: string,
  input: { data: unknown },
): Promise<SaveResult> {
  const meta = requireDocType(deps.registry, doctype);
  const raw = asRecord(input.data);
  if (!isValidDocId(id)) throw notFound(meta, id);
  const at = Timestamp.fromDate((deps.now ?? (() => new Date()))());
  const resolveChild = (name: string) => deps.registry.get(name);

  const saved = await deps.db.runTransaction(async (tx) => {
    const patch = { ...raw };
    const ref = docRef(deps.db, meta, id);
    const before = await readDoc(tx, ref);
    if (!before) throw notFound(meta, id);
    const orgPath = storedOrgPath(meta, before);
    const ownerPersonId = typeof before.ownerPersonId === 'string' ? before.ownerPersonId : null;
    const customFields = await loadCustomFields(tx, deps, meta, orgPath);
    const access = resolveDocAccess({ meta, customFields, user, doc: { orgPath, ownerPersonId }, resolveChild });
    if (!access.canRead) throw notFound(meta, id);
    if (!access.canWrite) throw new ApiError(403, 'forbidden', `You cannot edit this ${meta.name}`);
    assertWritable(access, patch, before);
    const parsed = parseOrThrow(access, 'update', patch);

    const { fields, system } = split(before);
    const ctx = contextFor(tx, deps, { meta, user, isNew: false, id, orgPath, before, doc: applyPatch(fields, parsed) });
    await runHooks(deps, ctx, 'save');
    const changed = diffDocs(before, ctx.doc);
    if (changed.length === 0) return { before, doc: before, changed, access };
    const writes: PendingWrite[] = [];
    await checkLinks(tx, deps, access.fields, before, ctx.doc);
    writes.push(...(await planUniques(tx, deps.db, meta, access.fields, id, before, ctx.doc)));

    const doc: StoredDoc = { ...ctx.doc, ...system, updatedAt: at, updatedBy: user.uid };
    for (const write of writes) write(tx);
    tx.set(ref, doc);
    if (meta.trackChanges) {
      tx.create(deps.db.collection(VERSIONS_COLLECTION).doc(), versionEntry(meta, id, 'update', changed, doc, user.uid, at));
    }
    return { before, doc, changed, access };
  });

  if (saved.changed.length > 0) await runEffect(deps, meta, id, saved.before, saved.doc);
  return respond(saved.doc, saved.access, saved.changed);
}

export async function deleteDoc(deps: PipelineDeps, user: UserContext, doctype: string, id: string): Promise<void> {
  const meta = requireDocType(deps.registry, doctype);
  if (!isValidDocId(id)) throw notFound(meta, id);
  const at = Timestamp.fromDate((deps.now ?? (() => new Date()))());
  const resolveChild = (name: string) => deps.registry.get(name);

  const before = await deps.db.runTransaction(async (tx) => {
    const ref = docRef(deps.db, meta, id);
    const before = await readDoc(tx, ref);
    if (!before) throw notFound(meta, id);
    const orgPath = storedOrgPath(meta, before);
    const ownerPersonId = typeof before.ownerPersonId === 'string' ? before.ownerPersonId : null;
    const access = resolveDocAccess({ meta, customFields: [], user, doc: { orgPath, ownerPersonId }, resolveChild });
    if (!access.canRead) throw notFound(meta, id);
    if (!access.canDelete) throw new ApiError(403, 'forbidden', `You cannot delete this ${meta.name}`);

    const ctx = contextFor(tx, deps, { meta, user, isNew: false, id, orgPath, before, doc: split(before).fields });
    await runHooks(deps, ctx, 'delete');
    const writes: PendingWrite[] = [];
    writes.push(...(await planUniques(tx, deps.db, meta, access.fields, id, before, {})));

    for (const write of writes) write(tx);
    tx.delete(ref);
    if (meta.trackChanges) {
      tx.create(deps.db.collection(VERSIONS_COLLECTION).doc(), versionEntry(meta, id, 'delete', diffDocs(before, {}), before, user.uid, at));
    }
    return before;
  });

  await runEffect(deps, meta, id, before, null);
}
