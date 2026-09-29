import '../global.css';
import { ClientProvider } from '@jci/client/react';
import { ErrorState, Screen } from '@jci/ui';
import { Stack } from 'expo-router';
import { appClient } from '../src/client';

export default function RootLayout() {
  if (!appClient.client) {
    return (
      <Screen>
        <ErrorState title="This build is not configured" message={appClient.configError} />
      </Screen>
    );
  }
  return (
    <ClientProvider client={appClient.client}>
      <Stack screenOptions={{ headerShown: false }} />
    </ClientProvider>
  );
}
