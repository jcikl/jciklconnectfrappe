import { useAuthState } from '@jci/client/react';
import { Redirect, Slot } from 'expo-router';
import { Screen, Spinner } from '@jci/ui';

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
  return <Slot />;
}
