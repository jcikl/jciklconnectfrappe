import { Box } from '../primitives/Box';
import { Heading } from '../primitives/Heading';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({ title, description, actionLabel, onAction, testID }: EmptyStateProps) {
  return (
    <Box testID={testID} padding="lg">
      <Stack gap="sm" align="center">
        <Heading level={3}>{title}</Heading>
        {description ? <Text tone="muted">{description}</Text> : null}
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
      </Stack>
    </Box>
  );
}
