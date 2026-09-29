import { signOutUser } from '@jci/client';
import { useAuthState, useClient } from '@jci/client/react';
import { Button, Heading, Screen, Text } from '@jci/ui';

export default function DeskHome() {
  const { client } = useClient();
  const auth = useAuthState();
  return (
    <Screen>
      <Heading level={1}>Desk</Heading>
      <Text tone="muted">{auth.status === 'signedIn' ? `Signed in as ${auth.email ?? auth.uid}` : ''}</Text>
      <Button label="Sign out" variant="secondary" onPress={() => signOutUser(client)} />
    </Screen>
  );
}
