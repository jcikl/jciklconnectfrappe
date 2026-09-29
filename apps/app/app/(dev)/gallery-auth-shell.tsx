import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { AuthShell, Button, Input } from '@jci/ui';

export default function GalleryAuthShell() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <AuthShell title="JCI Platform" subtitle="Sign in to continue" footer={<Button label="Back to gallery" variant="ghost" onPress={() => router.back()} />}>
      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Password" value="" onChangeText={() => {}} secureTextEntry />
      <Button label="Sign in" fullWidth onPress={() => {}} />
    </AuthShell>
  );
}
