import { ORGANIZATION_DOCTYPE, type ScopeOption } from '@jci/core';
import { useDocument } from '@jci/client/react';
import { registry } from '@jci/doctypes';
import { ListItem, Stack, Text } from '@jci/ui';
import { useDesk } from './DeskContext';

const ORGANIZATIONS = registry.get(ORGANIZATION_DOCTYPE).collection;

export function ScopePicker() {
  const { options, scope, setScope } = useDesk();
  if (options.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text variant="caption" tone="muted">
        Organisation
      </Text>
      {options.map((option) => (
        <ScopeItem
          key={option.orgId}
          option={option}
          selected={option.orgId === scope?.orgId}
          onPress={options.length > 1 ? () => setScope(option.orgId) : undefined}
        />
      ))}
    </Stack>
  );
}

function ScopeItem({ option, selected, onPress }: { option: ScopeOption; selected: boolean; onPress?: () => void }) {
  const org = useDocument(ORGANIZATIONS, option.orgId);
  // Some roles cannot read Organization documents; fall back to the id.
  const title = org.status === 'ready' && typeof org.doc?.data.title === 'string' ? org.doc.data.title : option.orgId;
  return (
    <ListItem
      testID={`scope-${option.orgId}`}
      title={title}
      subtitle={option.withDescendants ? 'Includes child organisations' : undefined}
      selected={selected}
      onPress={onPress}
    />
  );
}
