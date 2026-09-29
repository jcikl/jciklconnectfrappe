import { readableDocTypes } from '@jci/core';
import { registry } from '@jci/doctypes';
import { EmptyState, Heading, Page, Text } from '@jci/ui';
import { useDesk } from '../../../src/desk/DeskContext';

export default function DeskHome() {
  const { user } = useDesk();
  const readable = readableDocTypes(registry.all(), user);
  return (
    <Page>
      <Heading level={1}>Desk</Heading>
      {readable.length === 0 ? (
        <EmptyState title="No access yet" description="Ask an administrator to give you a role." />
      ) : (
        <Text tone="muted">Choose what to work on from the menu.</Text>
      )}
    </Page>
  );
}
