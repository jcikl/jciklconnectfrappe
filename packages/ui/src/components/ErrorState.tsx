import { Box } from '../primitives/Box';
import { Heading } from '../primitives/Heading';
import { Stack } from '../primitives/Stack';
import { Text } from '../primitives/Text';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  testID?: string;
}

export function ErrorState({ title = 'Something went wrong', message, retryLabel = 'Try again', onRetry, testID }: ErrorStateProps) {
  return (
    <Box testID={testID} padding="lg">
      <Stack gap="sm" align="center">
        <Heading level={3}>{title}</Heading>
        <Text tone="danger" accessibilityLiveRegion="polite">
          {message}
        </Text>
        {onRetry ? <Button label={retryLabel} variant="secondary" onPress={onRetry} /> : null}
      </Stack>
    </Box>
  );
}
