import { ActivityIndicator, View } from 'react-native';
import { Text } from '../primitives/Text';
import { useTheme } from '../theme/useTheme';
import { tokens } from '../tokens';

export interface SpinnerProps {
  label?: string;
  testID?: string;
}

export function Spinner({ label = 'Loading', testID }: SpinnerProps) {
  const { scheme } = useTheme();
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label} className="items-center justify-center gap-2 p-6">
      <ActivityIndicator color={tokens.semantic[scheme].primary} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}
