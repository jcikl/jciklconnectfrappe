import { signOutUser } from '@jci/client';
import { useAccess, useClient } from '@jci/client/react';
import { docTypeLabel, readableDocTypes } from '@jci/core';
import { registry } from '@jci/doctypes';
import { Slot, usePathname, useRouter } from 'expo-router';
import { Button, DeskShell, ErrorState, Screen, Spinner, Text } from '@jci/ui';
import { DeskProvider } from './DeskContext';
import { ScopePicker } from './ScopePicker';

/** Loads the caller's access, then renders the Desk shell around the current /desk route. */
export function DeskFrame({ uid, email }: { uid: string; email: string | null }) {
  const { client } = useClient();
  const access = useAccess(uid);
  const router = useRouter();
  const pathname = usePathname();

  if (access.status === 'loading') {
    return (
      <Screen>
        <Spinner label="Loading your access" />
      </Screen>
    );
  }
  if (access.status === 'error') {
    return (
      <Screen>
        <ErrorState title="Could not load your access" message={access.message} />
      </Screen>
    );
  }

  const nav = readableDocTypes(registry.all(), access.user).map((meta) => ({ key: meta.name, label: docTypeLabel(meta) }));
  return (
    <DeskProvider user={access.user}>
      <DeskShell
        title="JCI Desk"
        nav={nav}
        activeKey={pathname.split('/')[2]}
        onNavigate={(doctype) => router.push({ pathname: '/desk/[doctype]', params: { doctype } })}
        sidebarFooter={
          <>
            <ScopePicker />
            <Text variant="caption" tone="muted">
              {email ?? uid}
            </Text>
            <Button label="Sign out" variant="secondary" size="sm" onPress={() => signOutUser(client)} />
          </>
        }
      >
        <Slot />
      </DeskShell>
    </DeskProvider>
  );
}
