import { USER_ACCESS_COLLECTION, userContextFromAccess, VERSIONS_COLLECTION, type ListFilter, type UserContext } from '@jci/core';
import { onAuthStateChanged, type Auth } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query, where, type Firestore } from 'firebase/firestore';
import { createStore, type Store } from './store';

export type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; uid: string; email: string | null };
export type AccessState = { status: 'loading' } | { status: 'ready'; user: UserContext } | { status: 'error'; message: string };
export interface QueryDoc {
  id: string;
  data: Record<string, unknown>;
}
export type DocsState = { status: 'loading' } | { status: 'ready'; docs: QueryDoc[] } | { status: 'error'; message: string };
export type DocState = { status: 'loading' } | { status: 'ready'; doc: QueryDoc | null } | { status: 'error'; message: string };

/** Most documents a list query returns until M3c adds paging. */
export const LIST_LIMIT = 50;

export function createAuthStore(auth: Auth): Store<AuthState> {
  return createStore<AuthState>({ status: 'loading' }, (set) =>
    onAuthStateChanged(auth, (user) => set(user ? { status: 'signedIn', uid: user.uid, email: user.email } : { status: 'signedOut' })),
  );
}

/** The caller's grants, live from userAccess/{uid}. A missing doc means no roles. */
export function createAccessStore(db: Firestore, uid: string): Store<AccessState> {
  return createStore<AccessState>({ status: 'loading' }, (set) =>
    onSnapshot(
      doc(db, USER_ACCESS_COLLECTION, uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache) return; // server-confirmed only: no stale grants (offline is out of scope for M3a)
        set({ status: 'ready', user: userContextFromAccess(snap.exists() ? snap.data() : null, uid) });
      },
      (err) => set({ status: 'error', message: err.message }),
    ),
  );
}

/** A live list query. `filters` must come from listFilters so the rules allow it. */
export function createDocsStore(db: Firestore, collectionName: string, filters: readonly ListFilter[], max = LIST_LIMIT): Store<DocsState> {
  const q = query(collection(db, collectionName), ...filters.map((f) => where(f.field, f.op, f.value)), limit(max));
  return createStore<DocsState>({ status: 'loading' }, (set) =>
    onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache) return; // server-confirmed only: never show cached rows for a query the rules deny
        set({ status: 'ready', docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })) });
      },
      (err) => set({ status: 'error', message: err.message }),
    ),
  );
}

export function createDocStore(db: Firestore, collectionName: string, id: string): Store<DocState> {
  return createStore<DocState>({ status: 'loading' }, (set) =>
    onSnapshot(
      doc(db, collectionName, id),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache) return; // server-confirmed only: never show a cached doc the rules deny
        set({ status: 'ready', doc: snap.exists() ? { id: snap.id, data: snap.data() } : null });
      },
      (err) => set({ status: 'error', message: err.message }),
    ),
  );
}

/** Most version entries loaded for one document. */
export const VERSIONS_LIMIT = 100;

/** True when a versions result hit the limit, so older changes may exist. */
export function isCapped(docs: readonly unknown[], max = VERSIONS_LIMIT): boolean {
  return docs.length >= max;
}

/**
 * A document's version entries (newest first, at most `max`). `orgFilters` come from filtersForDoc, so the
 * query carries the doctype, docId and org constraints the versions rule needs. No composite index required.
 */
export function createVersionsStore(
  db: Firestore,
  doctype: string,
  docId: string,
  orgFilters: readonly ListFilter[],
  max = VERSIONS_LIMIT,
): Store<DocsState> {
  const q = query(
    collection(db, VERSIONS_COLLECTION),
    where('doctype', '==', doctype),
    where('docId', '==', docId),
    ...orgFilters.map((f) => where(f.field, f.op, f.value)),
    orderBy('at', 'desc'),
    limit(max),
  );
  return createStore<DocsState>({ status: 'loading' }, (set) =>
    onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache) return; // server-confirmed only, like every other store
        set({ status: 'ready', docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })) });
      },
      (err) => set({ status: 'error', message: err.message }),
    ),
  );
}

/** Custom field definitions for one DocType. CustomField is global, so any role holder may run this query. */
export function createCustomFieldsStore(db: Firestore, collectionName: string, targetDocType: string): Store<DocsState> {
  const q = query(collection(db, collectionName), where('targetDocType', '==', targetDocType));
  return createStore<DocsState>({ status: 'loading' }, (set) =>
    onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache) return; // server-confirmed only, like every other store
        set({ status: 'ready', docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })) });
      },
      (err) => set({ status: 'error', message: err.message }),
    ),
  );
}
