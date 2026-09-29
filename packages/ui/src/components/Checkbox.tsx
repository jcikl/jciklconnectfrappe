import { Pressable, Text as RNText, View } from 'react-native';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { FieldMessage } from './FieldMessage';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
  error?: string;
  testID?: string;
}

const FOCUS = 'web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-focus dark:web:focus-visible:ring-focus-dark';
const BOX_ON = 'bg-primary dark:bg-primary-dark';
const BOX_OFF = 'bg-surface dark:bg-surface-dark';
const BORDER_ON = 'border-primary dark:border-primary-dark';
const BORDER_OFF = 'border-border dark:border-border-dark';
const BORDER_ERROR = 'border-danger dark:border-danger-dark';

export function Checkbox({ label, checked, onChange, disabled = false, hint, error, testID }: CheckboxProps) {
  return (
    <View className="gap-1">
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={() => onChange(!checked)}
        className={cn('min-h-11 flex-row items-center gap-3 rounded-lg active:opacity-80', FOCUS, disabled && 'opacity-50')}
      >
        <View testID={testID ? `${testID}-box` : 'checkbox-box'} className={cn('h-6 w-6 items-center justify-center rounded border-2', checked ? BOX_ON : BOX_OFF, error ? BORDER_ERROR : checked ? BORDER_ON : BORDER_OFF)}>
          {checked ? <RNText className="text-sm font-bold text-on-primary dark:text-on-primary-dark">✓</RNText> : null}
        </View>
        <Text>{label}</Text>
      </Pressable>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}
