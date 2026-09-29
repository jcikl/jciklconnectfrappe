import { TextInput, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { useTheme } from '../theme/useTheme';
import { tokens } from '../tokens';

export interface InputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  multiline?: boolean;
  testID?: string;
}

export function Input({ label, error, hint, testID, multiline = false, ...inputProps }: InputProps) {
  const { scheme } = useTheme();
  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      <TextInput
        {...inputProps}
        testID={testID}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        accessibilityLabel={label}
        accessibilityHint={hint}
        // placeholderClassName has no effect on web; a concrete colour works on every platform.
        placeholderTextColor={tokens.semantic[scheme].textMuted}
        className={cn(
          'min-h-11 rounded-lg border bg-surface px-3 text-base text-text dark:bg-surface-dark dark:text-text-dark',
          'web:focus:border-focus dark:web:focus:border-focus-dark',
          error ? 'border-danger dark:border-danger-dark' : 'border-border dark:border-border-dark',
          multiline && 'min-h-24 py-2',
        )}
      />
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
