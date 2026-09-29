import { useAuthState } from '@jci/client/react';
import { Redirect, Stack } from 'expo-router';
import { Screen, Spinner } from '@jci/ui';

export default function AuthLayout() {
  const auth = useAuthState();
  if (auth.status === 'loading') {
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  }
  if (auth.status === 'signedIn') return <Redirect href="/desk" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
