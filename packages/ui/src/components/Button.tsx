import { ActivityIndicator, Pressable, Text as RNText } from 'react-native';
import { cn } from '../lib/cn';

const VARIANT = {
  primary: { box: 'bg-primary dark:bg-primary-dark', text: 'text-on-primary dark:text-on-primary-dark' },
  secondary: {
    box: 'border border-border bg-surface-muted dark:border-border-dark dark:bg-surface-muted-dark',
    text: 'text-text dark:text-text-dark',
  },
  ghost: { box: 'bg-transparent', text: 'text-primary dark:text-primary-dark' },
  danger: { box: 'bg-danger dark:bg-danger-dark', text: 'text-on-danger dark:text-on-danger-dark' },
} as const;

const SIZE = {
  sm: { box: 'min-h-11 px-3', text: 'text-sm' },
  md: { box: 'min-h-11 px-4', text: 'text-base' },
  lg: { box: 'min-h-12 px-6', text: 'text-lg' },
} as const;

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const v = VARIANT[variant];
  const s = SIZE[size];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-lg active:opacity-80',
        'web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-focus dark:web:focus-visible:ring-focus-dark',
        v.box,
        s.box,
        fullWidth && 'w-full',
        inactive && 'opacity-50',
      )}
    >
      {loading ? <ActivityIndicator className={v.text} /> : null}
      <RNText className={cn('font-semibold', v.text, s.text)}>{label}</RNText>
    </Pressable>
  );
}
