import { useRouter } from 'expo-router';
import { Button, Heading, Screen, Stack, Text } from '@jci/ui';

export default function Home() {
  const router = useRouter();
  return (
    <Screen>
      <Stack gap="sm">
        <Heading level={1}>JCI Platform</Heading>
        <Text tone="muted">Phase 1 — foundation</Text>
      </Stack>
      {__DEV__ ? <Button label="Open UI gallery" variant="secondary" onPress={() => router.push('/ui-gallery')} /> : null}
    </Screen>
  );
}
