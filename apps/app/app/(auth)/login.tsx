import { useState } from 'react';
import { authErrorMessage, signInWithEmail, signInWithGoogle } from '@jci/client';
import { useClient } from '@jci/client/react';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { AuthShell, Button, Input } from '@jci/ui';

export default function Login() {
  const { client } = useClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="JCI Platform"
      subtitle="Sign in to continue"
      footer={__DEV__ ? <Button label="Open UI gallery" variant="ghost" onPress={() => router.push('/ui-gallery')} /> : null}
    >
      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry error={error ?? undefined} />
      <Button
        label="Sign in"
        fullWidth
        loading={busy}
        disabled={email.trim() === '' || password === ''}
        onPress={() => run(() => signInWithEmail(client, email.trim(), password))}
      />
      {Platform.OS === 'web' ? (
        <Button label="Continue with Google" variant="secondary" fullWidth disabled={busy} onPress={() => run(() => signInWithGoogle(client))} />
      ) : null}
    </AuthShell>
  );
}
