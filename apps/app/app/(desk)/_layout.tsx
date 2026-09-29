import { useAuthState } from '@jci/client/react';
import { Redirect } from 'expo-router';
import { Screen, Spinner } from '@jci/ui';
import { DeskFrame } from '../../src/desk/DeskFrame';

export default function DeskLayout() {
  const auth = useAuthState();
  if (auth.status === 'loading') {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }
  if (auth.status === 'signedOut') return <Redirect href="/login" />;
  return <DeskFrame uid={auth.uid} email={auth.email} />;
}
