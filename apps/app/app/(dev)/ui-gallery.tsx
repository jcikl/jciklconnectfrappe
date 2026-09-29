import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Badge, Box, Button, Card, EmptyState, ErrorState, Heading, Input, ListItem, Screen, Spinner, Stack, Text, useTheme } from '@jci/ui';

export default function UiGallery() {
  const router = useRouter();
  const { scheme, toggle } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState('kl');

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen>
      <Stack direction="row" justify="between" align="center">
        <Heading level={1}>UI gallery</Heading>
        <Button label={scheme === 'dark' ? 'Light theme' : 'Dark theme'} variant="secondary" size="sm" onPress={toggle} />
      </Stack>

      <Card title="Typography">
        <Heading level={1}>Heading 1</Heading>
        <Heading level={2}>Heading 2</Heading>
        <Heading level={3}>Heading 3</Heading>
        <Text>Body text — default tone</Text>
        <Text tone="muted">Muted text</Text>
        <Text tone="primary">Primary text</Text>
        <Text tone="danger">Danger text</Text>
        <Text tone="success">Success text</Text>
        <Text tone="warning">Warning text</Text>
        <Text variant="caption">Caption</Text>
        <Text variant="label">Label</Text>
      </Card>

      <Card title="Buttons">
        <Stack direction="row" gap="sm" wrap>
          <Button label="Primary" onPress={() => {}} />
          <Button label="Secondary" variant="secondary" onPress={() => {}} />
          <Button label="Ghost" variant="ghost" onPress={() => {}} />
          <Button label="Danger" variant="danger" onPress={() => {}} />
        </Stack>
        <Stack direction="row" gap="sm" wrap align="center">
          <Button label="Small" size="sm" onPress={() => {}} />
          <Button label="Medium" size="md" onPress={() => {}} />
          <Button label="Large" size="lg" onPress={() => {}} />
        </Stack>
        <Stack direction="row" gap="sm" wrap>
          <Button label="Disabled" disabled onPress={() => {}} />
          <Button
            label={loading ? 'Saving' : 'Tap to load'}
            loading={loading}
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          />
        </Stack>
        <Button label="Full width" fullWidth onPress={() => {}} />
      </Card>

      <Card title="Inputs">
        <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@jcikl.cc" keyboardType="email-address" autoCapitalize="none" />
        <Input label="Phone" value="" onChangeText={() => {}} hint="Include country code, e.g. +60" />
        <Input label="Full name" value="" onChangeText={() => {}} error="Full name is required" />
        <Input label="Membership no." value="MEM-2026-00001" onChangeText={() => {}} editable={false} />
      </Card>

      <Card title="Badges">
        <Stack direction="row" gap="sm" wrap>
          <Badge label="Neutral" />
          <Badge label="Primary" tone="primary" />
          <Badge label="Accent" tone="accent" />
          <Badge label="Paid" tone="success" />
          <Badge label="Due soon" tone="warning" />
          <Badge label="Overdue" tone="danger" />
        </Stack>
      </Card>

      <Card title="Surfaces">
        <Box surface="muted" padding="md" rounded bordered>
          <Text>Muted surface, medium padding, rounded and bordered</Text>
        </Box>
      </Card>

      <Card title="Feedback">
        <Spinner label="Loading members" />
        <ErrorState message="You don't have permission to see this list." onRetry={() => {}} />
      </Card>

      <Card title="List items">
        <ListItem title="JCI Kuala Lumpur" subtitle="Local" selected={picked === 'kl'} onPress={() => setPicked('kl')} />
        <ListItem title="JCI Malaysia" subtitle="Includes child organisations" selected={picked === 'my'} onPress={() => setPicked('my')} />
        <ListItem title="Read-only row" subtitle="No onPress" />
      </Card>

      <Card title="Empty state">
        <EmptyState title="No members yet" description="Members you add will appear here." actionLabel="Add member" onAction={() => {}} />
      </Card>

      <Card title="Layouts">
        <Stack direction="row" gap="sm" wrap>
          <Button label="AuthShell" variant="secondary" onPress={() => router.push('/gallery-auth-shell')} />
          <Button label="DeskShell" variant="secondary" onPress={() => router.push('/gallery-desk-shell')} />
        </Stack>
      </Card>
    </Screen>
  );
}
