import { TextInput, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';

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
  testID?: string;
}

export function Input({ label, error, hint, testID, ...inputProps }: InputProps) {
  return (
    <View className="gap-1">
      <Text variant="label">{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderClassName="text-text-muted dark:text-text-muted-dark"
        className={cn(
          'min-h-11 rounded-lg border bg-surface px-3 text-base text-text dark:bg-surface-dark dark:text-text-dark',
          'web:focus:border-focus dark:web:focus:border-focus-dark',
          error ? 'border-danger dark:border-danger-dark' : 'border-border dark:border-border-dark',
        )}
        {...inputProps}
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
