import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Button, DeskShell, Heading, Page, Text } from '@jci/ui';

const NAV = [
  { key: 'Organization', label: 'Organization' },
  { key: 'RoleAssignment', label: 'Role Assignment' },
  { key: 'CustomField', label: 'Custom Field' },
];

export default function GalleryDeskShell() {
  const router = useRouter();
  const [active, setActive] = useState('Organization');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <DeskShell
      title="JCI Desk"
      nav={NAV}
      activeKey={active}
      onNavigate={setActive}
      sidebarFooter={<Button label="Back to gallery" variant="secondary" size="sm" onPress={() => router.back()} />}
    >
      <Page>
        <Heading level={2}>{active}</Heading>
        <Text tone="muted">Resize the window: at 768 px and wider the navigation is a sidebar.</Text>
      </Page>
    </DeskShell>
  );
}
