import '../global.css';
import { ClientProvider } from '@jci/client/react';
import { Stack } from 'expo-router';
import { client } from '../src/client';

export default function RootLayout() {
  return (
    <ClientProvider client={client}>
      <Stack screenOptions={{ headerShown: false }} />
    </ClientProvider>
  );
}
