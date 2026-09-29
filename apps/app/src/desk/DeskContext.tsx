import { scopeOptions, type ScopeOption, type UserContext } from '@jci/core';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface DeskContextValue {
  user: UserContext;
  options: ScopeOption[];
  /** The organisation the Desk shows; the widest option until the user picks one. */
  scope: ScopeOption | null;
  setScope: (orgId: string) => void;
}

const DeskContext = createContext<DeskContextValue | null>(null);

export function DeskProvider({ user, children }: { user: UserContext; children: ReactNode }) {
  const options = useMemo(() => scopeOptions(user), [user]);
  const [selected, setSelected] = useState<string | null>(null);
  const scope = options.find((o) => o.orgId === selected) ?? options[0] ?? null;
  const value = useMemo(() => ({ user, options, scope, setScope: setSelected }), [user, options, scope]);
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useDesk(): DeskContextValue {
  const value = useContext(DeskContext);
  if (!value) throw new Error('useDesk must be used inside <DeskProvider>');
  return value;
}
