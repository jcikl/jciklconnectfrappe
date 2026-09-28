import { Heading, Screen, Stack, Text } from '@jci/ui';

export default function Home() {
  return (
    <Screen>
      <Stack gap="sm">
        <Heading level={1}>JCI Platform</Heading>
        <Text tone="muted">Phase 1 — foundation</Text>
      </Stack>
    </Screen>
  );
}
