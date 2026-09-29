import type { ListFilter } from '@jci/core';
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createApiClient, type ApiClient } from './api';
import { currentIdToken } from './auth';
import type { FirebaseClient } from './firebase';
import { constantStore, type Store } from './store';
import {
  createAccessStore,
  createAuthStore,
  createDocsStore,
  createDocStore,
  type AccessState,
  type AuthState,
  type DocsState,
  type DocState,
} from './stores';

interface ClientContextValue {
  client: FirebaseClient;
  api: ApiClient;
  auth: Store<AuthState>;
}

const ClientContext = createContext<ClientContextValue | null>(null);

export function ClientProvider({ client, children }: { client: FirebaseClient; children: ReactNode }) {
  const value = useMemo<ClientContextValue>(
    () => ({
      client,
      api: createApiClient({ baseUrl: client.config.apiBaseUrl, getIdToken: () => currentIdToken(client) }),
      auth: createAuthStore(client.auth),
    }),
    [client],
  );
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient(): ClientContextValue {
  const value = useContext(ClientContext);
  if (!value) throw new Error('useClient must be used inside <ClientProvider>');
  return value;
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useAuthState(): AuthState {
  return useStore(useClient().auth);
}

const ACCESS_LOADING = constantStore<AccessState>({ status: 'loading' });
const NO_DOCS = constantStore<DocsState>({ status: 'ready', docs: [] });
const NO_DOC = constantStore<DocState>({ status: 'ready', doc: null });

export function useAccess(uid: string | null): AccessState {
  const { client } = useClient();
  const store = useMemo(() => (uid ? createAccessStore(client.db, uid) : ACCESS_LOADING), [client, uid]);
  return useStore(store);
}

/** A live list. Pass the filters from listFilters; null means "nothing to show here". */
export function useDocs(collection: string | null, filters: readonly ListFilter[] | null): DocsState {
  const { client } = useClient();
  // Filters are rebuilt on every render; key the store on their content, not their identity.
  const key = filters ? JSON.stringify(filters) : null;
  const store = useMemo(
    () => (collection && key !== null ? createDocsStore(client.db, collection, JSON.parse(key) as ListFilter[]) : NO_DOCS),
    [client, collection, key],
  );
  return useStore(store);
}

export function useDocument(collection: string | null, id: string | null): DocState {
  const { client } = useClient();
  const store = useMemo(() => (collection && id ? createDocStore(client.db, collection, id) : NO_DOC), [client, collection, id]);
  return useStore(store);
}
